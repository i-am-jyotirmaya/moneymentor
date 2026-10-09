import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../web/package.json", import.meta.url));
const { buildSync } = require("esbuild");
const bundle = buildSync({ entryPoints: [new URL("../../web/lib/platform.ts", import.meta.url).pathname], bundle: true, platform: "node", format: "esm", write: false }).outputFiles[0].text;
const platform = await import(`data:text/javascript;base64,${Buffer.from(bundle).toString("base64")}`);

test("native device speech takes precedence over a saved downloaded engine without changing consent", () => {
  const requests = [];
  const provider = { id: "native-test", location: "system" };
  const reset = platform.configurePlatform({
    isNativeSpeech: () => true,
    getTranscriptionProvider: privacy => { requests.push(privacy); return provider; },
    saveExport: async () => {},
  });
  try {
    assert.equal(platform.isNativeSpeechPlatform(), true);
    assert.equal(platform.getTranscriptionProvider("local-only", "whisper"), provider);
    assert.equal(platform.getTranscriptionProvider("allow-system", "browser"), provider);
    assert.deepEqual(requests, ["local-only", "allow-system"]);
  } finally { reset(); }
  assert.equal(platform.isNativeSpeechPlatform(), false);
});
