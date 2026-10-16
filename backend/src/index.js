// backend/src/index.js
// Accurova Workflow Dashboard — Express + Google Sheets API

import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { OAuth2Client } from "google-auth-library";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

// ── GOOGLE SHEETS ───────────────────────────────────────────────────────────
// OAuth (not a service-account key) — many Google Workspace orgs now block
// service-account key creation (iam.disableServiceAccountKeyCreation), same
// as the PhotoVault Tracker hit. This authenticates as a real Google account
// instead, via a refresh token generated once with
// `node scripts/get-oauth-refresh-token.js` (see README).
// Falls back to placeholder credentials when env vars are absent (e.g. CI
// runs without Google secrets) so routes that don't touch the sheet still work.
const oauthClient = new OAuth2Client({
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "placeholder-client-id",
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "placeholder-client-secret",
});
oauthClient.setCredentials({
  refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN || "placeholder-refresh-token",
});

const doc = new GoogleSpreadsheet(
  process.env.GOOGLE_SHEET_ID || "placeholder-sheet-id",
  oauthClient
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

// Columns the dashboard can edit. "Workflow Status" (not "Status" — that
// header is owned by the PhotoVault Tracker's own computed processing state
// when both apps share a sheet) so neither app's rewrite path clobbers the
// other's column.
const WRITABLE_COLUMNS = {
  "Workflow Status": "status",
  "Remarks":         "remarks",
  "Client":          "client",
  "Type":            "type",
  "Priority":        "priority",
  "Tags":             "tags",
};

const ALL_COLUMNS = { ...READONLY_COLUMNS, ...WRITABLE_COLUMNS };

// Fields shown on the public, unauthenticated dashboard — progress only, no
// internal triage detail. Deliberately excludes remarks, tags, priority and
// raw/processed counts.
const PUBLIC_FIELDS = ["id", "name", "date", "client", "type", "status", "ratio", "status_icon"];

function toPublicProject(project) {
  return Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, project[k]]));
}

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
  methods: ["GET", "POST", "PATCH"],
  allowedHeaders: ["Content-Type", "x-admin-token"],
}));

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ── ADMIN AUTH ────────────────────────────────────────────────────────────────
// Single shared password (ADMIN_PASSWORD), gating the admin dashboard
// (/projects routes). On success, issues a signed, self-expiring session
// token — no server-side session store needed, so it survives restarts and
// works across multiple instances.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function signToken(expiresAt) {
  const hmac = crypto.createHmac("sha256", process.env.ADMIN_PASSWORD || "")
    .update(String(expiresAt))
    .digest("hex");
  return `${expiresAt}.${hmac}`;
}

function verifyToken(token) {
  if (!token || !process.env.ADMIN_PASSWORD) return false;
  const [expiresAtStr, hmac] = token.split(".");
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || !hmac || Date.now() > expiresAt) return false;
  const expected = signToken(expiresAt).split(".")[1];
  const a = Buffer.from(hmac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post("/admin/login", (req, res) => {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: "Server misconfigured: ADMIN_PASSWORD not set" });
  }
  const { password } = req.body;
  const a = Buffer.from(String(password || ""));
  const b = Buffer.from(process.env.ADMIN_PASSWORD);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) return res.status(401).json({ error: "Incorrect password" });

  const expiresAt = Date.now() + SESSION_TTL_MS;
  res.json({ token: signToken(expiresAt), expiresAt });
});

function requireAdminToken(req, res, next) {
  if (!verifyToken(req.get("x-admin-token"))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
app.use("/projects", requireAdminToken);

// ── PUBLIC DASHBOARD ────────────────────────────────────────────────────────────
// No auth — read-only, progress fields only. Meant for the public-facing page.
app.get("/public/projects", async (req, res) => {
  try {
    const sheet = await getSheet();
    const rows = await sheet.getRows();
    const projects = rows.map(rowToProject).map(toPublicProject);
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PROJECTS (admin) ────────────────────────────────────────────────────────────

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
