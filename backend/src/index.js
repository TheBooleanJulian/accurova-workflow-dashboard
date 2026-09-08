// backend/src/index.js
// Accurova Workflow Dashboard — Express + Google Sheets API

import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { fileURLToPath } from "node:url";

// ── GOOGLE SHEETS ───────────────────────────────────────────────────────────
// Falls back to placeholder credentials when env vars are absent (e.g. CI runs
// without Google secrets) so routes that don't touch the sheet still work.
const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "placeholder@placeholder.iam.gserviceaccount.com",
  key: (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "placeholder-key").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const doc = new GoogleSpreadsheet(
  process.env.GOOGLE_SHEET_ID || "placeholder-sheet-id",
  serviceAccountAuth
);

// Columns written by the folder-scan script — read-only from the API.
const READONLY_COLUMNS = {
  "Photoshoot Name": "name",
  "Date":            "date",
  "Root Folder":     "root_folder",
  "Full Path":        "full_path",
  "RAW Count":        "raw_count",
  "Processed Count":  "processed_count",
  "Ratio %":          "ratio",
  "Last Scanned":     "last_scanned",
  "Status Icon":      "status_icon",
};

// Columns the dashboard can edit.
const WRITABLE_COLUMNS = {
  "Status":   "status",
  "Remarks":  "remarks",
  "Client":   "client",
  "Type":     "type",
  "Priority": "priority",
  "Tags":     "tags",
};

const ALL_COLUMNS = { ...READONLY_COLUMNS, ...WRITABLE_COLUMNS };

let sheetPromise = null;
function getSheet() {
  if (!sheetPromise) {
    sheetPromise = doc.loadInfo().then(() => doc.sheetsByIndex[0]);
  }
  return sheetPromise;
}

function rowToProject(row) {
  const project = { id: row.rowNumber };
  for (const [header, key] of Object.entries(ALL_COLUMNS)) {
    project[key] = row.get(header) ?? "";
  }
  if (project.raw_count !== "")       project.raw_count = Number(project.raw_count);
  if (project.processed_count !== "") project.processed_count = Number(project.processed_count);
  if (project.ratio !== "")           project.ratio = Number(String(project.ratio).replace("%", ""));
  project.tags = project.tags ? project.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  return project;
}

// ── APP ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "PATCH"],
}));

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ── AUTH ──────────────────────────────────────────────────────────────────────
// Shared-secret gate in front of every /projects route. Fails closed: if
// API_KEY isn't configured, requests are rejected rather than left open.
function requireApiKey(req, res, next) {
  if (!process.env.API_KEY) {
    return res.status(503).json({ error: "Server misconfigured: API_KEY not set" });
  }
  if (req.get("x-api-key") !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
app.use("/projects", requireApiKey);

// ── PROJECTS ──────────────────────────────────────────────────────────────────

// GET /projects — list all, optional ?status= ?priority= ?type= filter
app.get("/projects", async (req, res) => {
  try {
    const sheet = await getSheet();
    const rows = await sheet.getRows();
    let projects = rows.map(rowToProject);

    if (req.query.status)   projects = projects.filter((p) => p.status === req.query.status);
    if (req.query.priority) projects = projects.filter((p) => p.priority === req.query.priority);
    if (req.query.type)     projects = projects.filter((p) => p.type === req.query.type);

    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /projects/:id — single project (id = sheet row number)
app.get("/projects/:id", async (req, res) => {
  try {
    const sheet = await getSheet();
    const rows = await sheet.getRows();
    const row = rows.find((r) => r.rowNumber === Number(req.params.id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(rowToProject(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /projects/:id — update dashboard-owned fields (status, remarks,
// client, type, priority, tags). RAW/Processed/Ratio stay script-owned.
app.patch("/projects/:id", async (req, res) => {
  try {
    const writableKeys = Object.values(WRITABLE_COLUMNS);
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => writableKeys.includes(k))
    );

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const sheet = await getSheet();
    const rows = await sheet.getRows();
    const row = rows.find((r) => r.rowNumber === Number(req.params.id));
    if (!row) return res.status(404).json({ error: "Not found" });

    for (const [header, key] of Object.entries(WRITABLE_COLUMNS)) {
      if (key in updates) {
        const value = updates[key];
        row.set(header, Array.isArray(value) ? value.join(", ") : value);
      }
    }
    await row.save();

    res.json(rowToProject(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
export { app };

const PORT = process.env.PORT || 3001;
// Only bind the port when run directly, not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`[accurova-api] listening on :${PORT}`);
  });
}
