import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "./index.js";

const PORT = 3099;
const BASE = `http://localhost:${PORT}`;
let server;

before(() => new Promise((resolve) => { server = app.listen(PORT, resolve); }));
after(()  => new Promise((resolve) => { server.close(resolve); }));

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { hostname: "localhost", port: PORT, path, method,
        headers: { "Content-Type": "application/json" } },
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

test("POST /projects with missing required fields returns 400", async () => {
  const { status, body } = await req("POST", "/projects", { name: "Missing fields" });
  assert.equal(status, 400);
  assert.ok(body.error, "error message should be present");
});

test("PATCH /projects/:id with no valid fields returns 400", async () => {
  const { status, body } = await req("PATCH", "/projects/1", { bogusField: "x" });
  assert.equal(status, 400);
  assert.equal(body.error, "No valid fields to update");
});
