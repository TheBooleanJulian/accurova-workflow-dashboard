process.env.ADMIN_PASSWORD ??= "test-password";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "./index.js";

const PORT = 3099;
const BASE = `http://localhost:${PORT}`;
let server;
let adminToken;

before(async () => {
  await new Promise((resolve) => { server = app.listen(PORT, resolve); });
  const { body } = await req("POST", "/admin/login", { password: process.env.ADMIN_PASSWORD });
  adminToken = body.token;
});
after(()  => new Promise((resolve) => { server.close(resolve); }));

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { hostname: "localhost", port: PORT, path, method,
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken || "", ...headers } },
      (res) => {
        let raw = "";
        res.on("data", (c) => { raw += c; });
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
      }
    );
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

test("GET /health returns 200 with status ok", async () => {
  const { status, body } = await req("GET", "/health");
  assert.equal(status, 200);
  assert.equal(body.status, "ok");
  assert.ok(typeof body.ts === "string", "ts should be a string");
});

test("POST /admin/login with the wrong password returns 401", async () => {
  const { status, body } = await req("POST", "/admin/login", { password: "nope" });
  assert.equal(status, 401);
  assert.equal(body.error, "Incorrect password");
});

test("POST /admin/login with the right password returns a token", async () => {
  const { status, body } = await req("POST", "/admin/login", { password: process.env.ADMIN_PASSWORD });
  assert.equal(status, 200);
  assert.ok(typeof body.token === "string" && body.token.length > 0);
});

test("GET /projects without an admin token returns 401", async () => {
  const { status, body } = await req("GET", "/projects", undefined, { "x-admin-token": "" });
  assert.equal(status, 401);
  assert.equal(body.error, "Unauthorized");
});

test("GET /public/projects requires no auth", async () => {
  const { status } = await req("GET", "/public/projects", undefined, { "x-admin-token": "" });
  assert.notEqual(status, 401);
});

test("PATCH /projects/:id with no valid fields returns 400", async () => {
  const { status, body } = await req("PATCH", "/projects/2", { bogusField: "x" });
  assert.equal(status, 400);
  assert.equal(body.error, "No valid fields to update");
});

test("PATCH /projects/:id rejects script-owned fields (raw_count, ratio, ...)", async () => {
  const { status, body } = await req("PATCH", "/projects/2", { raw_count: 999, ratio: 50 });
  assert.equal(status, 400);
  assert.equal(body.error, "No valid fields to update");
});
