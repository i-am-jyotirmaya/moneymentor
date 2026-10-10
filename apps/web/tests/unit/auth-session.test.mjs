import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../../lib/auth-session.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const session = { accessToken: "test-token", accessTokenExpiresAt: "2099-01-01T00:00:00Z" };

function load(window = new EventTarget()) {
  const exports = {};
  runInNewContext(compiled, { exports, window, Event, navigator: {} });
  return exports;
}

test("module reload preserves the in-memory session and notifies subscribers", () => {
  const browser = new EventTarget();
  const first = load(browser);
  let changes = 0;
  const unsubscribe = first.subscribeToAuthSession(() => changes++);
  first.saveAuthSession(session);
  const reloaded = load(browser);
  assert.equal(reloaded.getAuthSessionSnapshot(), session);
  reloaded.clearAuthSession();
  assert.equal(first.readAuthSession(), null);
  assert.equal(changes, 2);
  unsubscribe();
});

test("module reload shares the pending refresh and allows subsequent refreshes", async () => {
  const browser = new EventTarget();
  const first = load(browser);
  let finish;
  let requests = 0;
  const pending = first.coordinateSessionRefresh(() => {
    requests++;
    return new Promise(resolve => { finish = resolve; });
  });
  const reloaded = load(browser);
  const shared = reloaded.coordinateSessionRefresh(() => {
    requests++;
    return Promise.resolve(session);
  });
  assert.equal(pending, shared);
  finish(session);
  assert.equal(await shared, session);
  await reloaded.coordinateSessionRefresh(() => {
    requests++;
    return Promise.resolve(session);
  });
  assert.equal(requests, 2);
});

test("failed refresh releases coordination for recovery without discarding the session", async () => {
  const auth = load();
  auth.saveAuthSession(session);
  await assert.rejects(auth.coordinateSessionRefresh(() => Promise.reject(new Error("offline"))), /offline/);
  assert.equal(auth.readAuthSession(), session);
  assert.equal(await auth.coordinateSessionRefresh(() => Promise.resolve(session)), session);
});

test("server rendering never retains a user session", () => {
  // A separate context with no window represents SSR.
  const exports = {};
  runInNewContext(compiled, { exports });
  exports.saveAuthSession(session);
  assert.equal(exports.readAuthSession(), null);
  assert.equal(exports.getAuthSessionSnapshot(), null);
});
