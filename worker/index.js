// worker/index.js
// Accurova Workflow Dashboard on Cloudflare Workers: the Express API (backend/src/index.js) ported to the Google
// Sheets REST API, plus the Vite frontend as static assets — one origin, workflow.accurova.com.
//
// The frontend calls /api/* (its default BASE when VITE_API_URL is unset); this Worker strips /api, exactly like the
// Vite dev proxy, so the routes below match the Express ones:
//   GET  /health                    GET  /public/projects?token=
//   POST /admin/login               GET  /projects  /projects/:id   PATCH /projects/:id   POST /projects/link
//
// Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN, GOOGLE_SHEET_ID,
// ADMIN_PASSWORD (same names and values as the Zeabur backend). Admin tokens are signed the same way, so a token
// issued by the old backend keeps working after cutover.
//
// One deliberate difference: google-spreadsheet's row.save() rewrote the whole row from its formatted values; this
// writes only the cells that changed, so formulas or formatting in other columns are never overwritten.

// Columns written by the folder-scan script — read-only from the API.
const READONLY_COLUMNS = {
  "Photoshoot Name": "name",
  "Date":            "date",
  "Root Folder":     "root_folder",
  "Full Path":       "full_path",
  "RAW Count":       "raw_count",
  "Processed Count": "processed_count",
  "Ratio %":         "ratio",
  "Last Scanned":    "last_scanned",
  "Status Icon":     "status_icon",
};

// Columns the dashboard can edit. "Workflow Status" (not "Status": that header is owned by the PhotoVault Tracker).
const WRITABLE_COLUMNS = {
  "Workflow Status": "status",
  "Remarks":         "remarks",
  "Client":          "client",
  "Type":            "type",
  "Priority":        "priority",
  "Tags":            "tags",
};

// Only set through POST /projects/link (one token per Client, propagated to all of that client's rows).
const INTERNAL_COLUMNS = {
  "Client Token": "client_token",
};

const ALL_COLUMNS = { ...READONLY_COLUMNS, ...WRITABLE_COLUMNS, ...INTERNAL_COLUMNS };

// Fields shown on the public, per-client dashboard: progress only. Deliberately excludes remarks, tags, priority
// and raw/processed counts.
const PUBLIC_FIELDS = ["id", "name", "date", "client", "type", "status", "ratio", "status_icon"];

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ── GOOGLE SHEETS (REST) ──────────────────────────────────────────────────────
// OAuth refresh token, not a service-account key (key creation is blocked in this GCP org; see CLAUDE.md).
let cachedToken = null;
let cachedTitle = null;

async function accessToken(env) {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) return cachedToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.GOOGLE_OAUTH_CLIENT_ID || "",
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN || "",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Google OAuth token refresh failed: ${data.error || res.status}`);
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function sheetsFetch(env, path, init = {}) {
  const res = await fetch(`${SHEETS}/${encodeURIComponent(env.GOOGLE_SHEET_ID || "")}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken(env)}`, "Content-Type": "application/json", ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Sheets API: ${data.error?.message || res.status}`);
  return data;
}

const quoteTitle = (title) => `'${title.replace(/'/g, "''")}'`;

export function columnLetter(index) {
  let n = index + 1, out = "";
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

// Same shape google-spreadsheet gave: the first sheet's header row, and rows numbered by their sheet row (header = 1).
async function loadSheet(env) {
  if (!cachedTitle) {
    const meta = await sheetsFetch(env, "?fields=sheets.properties(title,index)");
    const first = (meta.sheets || []).map((s) => s.properties).sort((a, b) => a.index - b.index)[0];
    if (!first) throw new Error("Spreadsheet has no sheets");
    cachedTitle = first.title;
  }
  const data = await sheetsFetch(env, `/values/${encodeURIComponent(quoteTitle(cachedTitle))}?majorDimension=ROWS`);
  const values = data.values || [];
  const headerValues = (values[0] || []).map((h) => String(h).trim());
  const rows = values.slice(1).map((raw, i) => makeRow(headerValues, raw, i + 2));
  return { title: cachedTitle, headerValues, rows };
}

function makeRow(headerValues, raw, rowNumber) {
  const cells = [...raw];
  const changed = new Map();
  return {
    rowNumber,
    get: (header) => { const i = headerValues.indexOf(header); return i === -1 ? undefined : cells[i]; },
    // Like google-spreadsheet: setting a header that isn't in the sheet is a silent no-op.
    set: (header, value) => { const i = headerValues.indexOf(header); if (i !== -1) { cells[i] = value; changed.set(i, value); } },
    changed,
  };
}

async function saveRows(env, sheet, rows) {
  const data = [];
  for (const row of rows) {
    for (const [i, value] of row.changed) {
      data.push({ range: `${quoteTitle(sheet.title)}!${columnLetter(i)}${row.rowNumber}`, values: [[value]] });
    }
    row.changed.clear();
  }
  if (!data.length) return;
  await sheetsFetch(env, "/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }) });
}

export function rowToProject(row) {
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

const toPublicProject = (project) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, project[k]]));

// ── ADMIN AUTH ────────────────────────────────────────────────────────────────
// Single shared password (ADMIN_PASSWORD). Token = `${expiresAt}.${hex HMAC-SHA256(ADMIN_PASSWORD, expiresAt)}`,
// byte-for-byte what the Express backend issued.
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function signToken(env, expiresAt) {
  return `${expiresAt}.${await hmacHex(env.ADMIN_PASSWORD || "", String(expiresAt))}`;
}

async function verifyToken(env, token) {
  if (!token || !env.ADMIN_PASSWORD) return false;
  const [expiresAtStr, hmac] = token.split(".");
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || !hmac || Date.now() > expiresAt) return false;
  return timingSafeEqual(hmac, await hmacHex(env.ADMIN_PASSWORD, String(expiresAt)));
}

// ── ROUTES ────────────────────────────────────────────────────────────────────
function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function route(request, env, path, url) {
  const method = request.method;
  const body = method === "POST" || method === "PATCH" ? await request.json().catch(() => ({})) : {};

  if (method === "GET" && path === "/health") return { status: "ok", ts: new Date().toISOString() };

  if (method === "POST" && path === "/admin/login") {
    if (!env.ADMIN_PASSWORD) throw new HttpError(503, "Server misconfigured: ADMIN_PASSWORD not set");
    if (!timingSafeEqual(String(body.password || ""), env.ADMIN_PASSWORD)) throw new HttpError(401, "Incorrect password");
    const expiresAt = Date.now() + SESSION_TTL_MS;
    return { token: await signToken(env, expiresAt), expiresAt };
  }

  // Public dashboard: a per-client token is required and scopes the response. Never a blanket listing.
  if (method === "GET" && path === "/public/projects") {
    const token = url.searchParams.get("token") || "";
    if (!token) throw new HttpError(400, "Missing access token");
    const sheet = await loadSheet(env);
    return sheet.rows.map(rowToProject).filter((p) => p.client_token && p.client_token === token).map(toPublicProject);
  }

  if (path === "/projects" || path.startsWith("/projects/")) {
    if (!(await verifyToken(env, request.headers.get("x-admin-token")))) throw new HttpError(401, "Unauthorized");

    if (method === "GET" && path === "/projects") {
      const sheet = await loadSheet(env);
      let projects = sheet.rows.map(rowToProject);
      for (const key of ["status", "priority", "type"]) {
        const want = url.searchParams.get(key);
        if (want) projects = projects.filter((p) => p[key] === want);
      }
      return projects;
    }

    // POST /projects/link — generate (or reuse) one private-link token for a client and write it to every row
    // with that client name (case-insensitive exact match).
    if (method === "POST" && path === "/projects/link") {
      const client = String(body.client || "").trim();
      if (!client) throw new HttpError(400, "client is required");
      const sheet = await loadSheet(env);
      if (!sheet.headerValues.includes("Client Token")) {
        throw new HttpError(500, "Sheet is missing the 'Client Token' column — add it to the header row first (see README §1)");
      }
      const matching = sheet.rows.filter((r) => String(r.get("Client") || "").trim().toLowerCase() === client.toLowerCase());
      if (matching.length === 0) throw new HttpError(404, "No shoots found for that client");
      const token = matching.map((r) => r.get("Client Token")).find(Boolean) || randomHex(16);
      for (const row of matching) if (row.get("Client Token") !== token) row.set("Client Token", token);
      await saveRows(env, sheet, matching);
      return { token, client, shootCount: matching.length };
    }

    const m = /^\/projects\/(\d+)$/.exec(path);
    if (m && method === "GET") {
      const sheet = await loadSheet(env);
      const row = sheet.rows.find((r) => r.rowNumber === Number(m[1]));
      if (!row) throw new HttpError(404, "Not found");
      return rowToProject(row);
    }

    // PATCH /projects/:id — dashboard-owned fields only; RAW/Processed/Ratio stay script-owned.
    if (m && method === "PATCH") {
      const writableKeys = Object.values(WRITABLE_COLUMNS);
      const updates = Object.fromEntries(Object.entries(body || {}).filter(([k]) => writableKeys.includes(k)));
      if (Object.keys(updates).length === 0) throw new HttpError(400, "No valid fields to update");
      const sheet = await loadSheet(env);
      const row = sheet.rows.find((r) => r.rowNumber === Number(m[1]));
      if (!row) throw new HttpError(404, "Not found");
      for (const [header, key] of Object.entries(WRITABLE_COLUMNS)) {
        if (key in updates) row.set(header, Array.isArray(updates[key]) ? updates[key].join(", ") : updates[key]);
      }
      await saveRows(env, sheet, [row]);
      return rowToProject(row);
    }
  }
  throw new HttpError(404, "Not found");
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.FRONTEND_URL || "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH",
    "Access-Control-Allow-Headers": "Content-Type,x-admin-token",
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") url.pathname = "/api/health";
    if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env) });

    const path = url.pathname.slice(4) || "/";
    let status = 200, payload;
    try {
      payload = await route(request, env, path, url);
    } catch (err) {
      status = err instanceof HttpError ? err.status : 500;
      payload = { error: err.message };
    }
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(env) },
    });
  },
};
