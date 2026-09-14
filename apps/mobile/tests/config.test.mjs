import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { mobileLinkTarget } from "../lib/deep-links.mjs";
import { validateApiUrl } from "../lib/config.mjs";

test("accepts approved web and native invitations without moving the token into a query", () => {
  assert.equal(mobileLinkTarget("https://mvp.spndrr.com/signup#token=abc%2B123"), "/signup/#token=abc%2B123");
  assert.equal(mobileLinkTarget("spndrr://signup#token=abc"), "/signup/#token=abc");
  assert.equal(mobileLinkTarget("spndrr:///transactions"), "/transactions/");
  assert.equal(mobileLinkTarget("https://mvp.spndrr.com/signup?token=secret"), "/signup/");
});

test("rejects untrusted origins, scripts, credentials and unknown routes", () => {
  for (const value of ["https://evil.example/signup#token=abc", "https://mvp.spndrr.com.evil.example/signup", "javascript:alert(1)", "spndrr://admin", "https://user:pass@mvp.spndrr.com/signup", "/signup#token=abc", "http://mvp.spndrr.com/signup"]) {
    assert.equal(mobileLinkTarget(value), null, value);
  }
});

test("production builds require a reachable HTTPS API, with no embedded secrets", () => {
  for (const value of [undefined, "", "/api", "http://api.example.com", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://user:pass@api.example.com", "https://api.example.com?key=secret", "file:///tmp/api"]) {
    assert.throws(() => validateApiUrl(value, true), undefined, String(value));
  }
  assert.doesNotThrow(() => validateApiUrl("https://api.example.com", true));
  assert.doesNotThrow(() => validateApiUrl("http://localhost:5267", false));
});

test("every current web screen has a corresponding mobile route", () => {
  const pages = directory => readdirSync(new URL(directory, import.meta.url), { recursive: true })
    .filter(name => name === "page.tsx" || name.endsWith("/page.tsx")).sort();
  assert.deepEqual(pages("../app/"), pages("../../web/app/"));
});
