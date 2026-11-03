// worker/index.test.js — node --test
// The Express backend's tests, ported to the Worker, plus a fake Google Sheets API for the data routes.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import nodeCrypto from "node:crypto";
import worker, { columnLetter, signToken } from "./index.js";

const ENV = {
  ADMIN_PASSWORD: "test-password",
  GOOGLE_OAUTH_CLIENT_ID: "cid", GOOGLE_OAUTH_CLIENT_SECRET: "cs", GOOGLE_OAUTH_REFRESH_TOKEN: "rt", GOOGLE_SHEET_ID: "sheet1",
  ASSETS: { fetch: async () => new Response("spa") },
};

const HEADER = ["Photoshoot Name", "Date", "RAW Count", "Processed Count", "Ratio %", "Workflow Status", "Client", "Tags", "Remarks", "Client Token"];
let sheet, writes, realFetch;

beforeEach(() => {
  sheet = [
    HEADER,
    ["Shoot A", "2026-10-01", "100", "50", "50%", "Editing", "Acme", "a, b", "secret note", "tok-acme"],
    ["Shoot B", "2026-10-02", "10", "10", "100%", "Done", "acme ", "", "", ""],
    ["Shoot C", "2026-10-03", "5", "0", "0%", "", "Other"],
  ];
  writes = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "at", expires_in: 3600 });
    if (u.pathname.endsWith("/values:batchUpdate")) {
      const body = JSON.parse(init.body);
      writes.push(...body.data);
      return Response.json({});
    }
    if (u.pathname.includes("/values/")) return Response.json({ values: sheet });
    if (u.searchParams.get("fields")) return Response.json({ sheets: [{ properties: { title: "Shoots", index: 0 } }] });
    return new Response("{}", { status: 404 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

async function req(method, path, body, headers = {}) {
  const res = await worker.fetch(new Request(`https://workflow.accurova.com/api${path}`, {
    method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined,
  }), ENV);
  return { status: res.status, body: await res.json() };
}
async function admin() {
  return { "x-admin-token": (await req("POST", "/admin/login", { password: "test-password" })).body.token };
}

test("GET /health returns 200 with status ok", async () => {
  const { status, body } = await req("GET", "/health");
  assert.equal(status, 200);
  assert.equal(body.status, "ok");
  assert.equal(typeof body.ts, "string");
});

test("POST /admin/login: wrong password 401, right password returns a token", async () => {
  assert.deepEqual(await req("POST", "/admin/login", { password: "nope" }), { status: 401, body: { error: "Incorrect password" } });
  const { status, body } = await req("POST", "/admin/login", { password: "test-password" });
  assert.equal(status, 200);
  assert.ok(body.token.length > 0);
});

test("admin tokens are the same bytes the Express backend signed, so old sessions keep working", async () => {
  const expiresAt = Date.now() + 60000;
  const expressToken = `${expiresAt}.${nodeCrypto.createHmac("sha256", "test-password").update(String(expiresAt)).digest("hex")}`;
  assert.equal(await signToken(ENV, expiresAt), expressToken);
  assert.equal((await req("GET", "/projects", undefined, { "x-admin-token": expressToken })).status, 200);
  const expired = await signToken(ENV, Date.now() - 1);
  assert.equal((await req("GET", "/projects", undefined, { "x-admin-token": expired })).status, 401);
});

test("GET /projects without an admin token returns 401", async () => {
  assert.deepEqual(await req("GET", "/projects"), { status: 401, body: { error: "Unauthorized" } });
});

test("GET /public/projects without a token returns 400, not everyone's data", async () => {
  assert.deepEqual(await req("GET", "/public/projects"), { status: 400, body: { error: "Missing access token" } });
});

test("GET /public/projects is scoped to the token and strips internal fields", async () => {
  const { body } = await req("GET", "/public/projects?token=tok-acme");
  assert.deepEqual(body, [{ id: 2, name: "Shoot A", date: "2026-10-01", client: "Acme", type: "", status: "Editing", ratio: 50, status_icon: "" }]);
  assert.deepEqual((await req("GET", "/public/projects?token=unknown")).body, []);
});

test("GET /projects maps rows like google-spreadsheet did and filters by status", async () => {
  const h = await admin();
  const all = (await req("GET", "/projects", undefined, h)).body;
  assert.equal(all.length, 3);
  assert.deepEqual(all[0].tags, ["a", "b"]);
  assert.equal(all[0].raw_count, 100);
  assert.equal(all[2].id, 4);
  assert.equal(all[2].client_token, ""); // short row: missing cells read as ""
  assert.equal((await req("GET", "/projects?status=Done", undefined, h)).body.length, 1);
  assert.equal((await req("GET", "/projects/3", undefined, h)).body.name, "Shoot B");
  assert.equal((await req("GET", "/projects/99", undefined, h)).status, 404);
});

test("PATCH /projects/:id rejects unknown and script-owned fields", async () => {
  const h = await admin();
  assert.deepEqual(await req("PATCH", "/projects/2", { bogusField: "x" }, h), { status: 400, body: { error: "No valid fields to update" } });
  assert.deepEqual(await req("PATCH", "/projects/2", { raw_count: 999, ratio: 50 }, h), { status: 400, body: { error: "No valid fields to update" } });
});

test("PATCH /projects/:id writes only the changed cells", async () => {
  const h = await admin();
  const { status, body } = await req("PATCH", "/projects/3", { status: "Delivered", tags: ["x", "y"] }, h);
  assert.equal(status, 200);
  assert.equal(body.status, "Delivered");
  assert.deepEqual(writes, [
    { range: "'Shoots'!F3", values: [["Delivered"]] },
    { range: "'Shoots'!H3", values: [["x, y"]] },
  ]);
});

test("POST /projects/link reuses a client's token across rows (case-insensitive) and only writes rows that differ", async () => {
  const h = await admin();
  assert.deepEqual(await req("POST", "/projects/link", { client: "" }, h), { status: 400, body: { error: "client is required" } });
  const { body } = await req("POST", "/projects/link", { client: "ACME" }, h);
  assert.deepEqual(body, { token: "tok-acme", client: "ACME", shootCount: 2 });
  assert.deepEqual(writes, [{ range: "'Shoots'!J3", values: [["tok-acme"]] }]);
  writes.length = 0;
  const fresh = (await req("POST", "/projects/link", { client: "Other" }, h)).body;
  assert.match(fresh.token, /^[0-9a-f]{32}$/);
  assert.deepEqual(writes, [{ range: "'Shoots'!J4", values: [[fresh.token]] }]);
  assert.equal((await req("POST", "/projects/link", { client: "Nobody" }, h)).status, 404);
});

test("POST /projects/link fails loudly when the sheet has no Client Token column", async () => {
  sheet = sheet.map((r) => r.slice(0, 9));
  const { status, body } = await req("POST", "/projects/link", { client: "Acme" }, await admin());
  assert.equal(status, 500);
  assert.match(body.error, /missing the 'Client Token' column/);
});

test("non-/api paths serve the SPA; columnLetter handles wide sheets", async () => {
  assert.equal(await (await worker.fetch(new Request("https://workflow.accurova.com/"), ENV)).text(), "spa");
  assert.equal(columnLetter(0), "A");
  assert.equal(columnLetter(25), "Z");
  assert.equal(columnLetter(26), "AA");
  assert.equal(columnLetter(701), "ZZ");
});
