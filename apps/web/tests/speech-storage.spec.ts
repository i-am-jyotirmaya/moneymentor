import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";

// Run the actual adapter in a browser, rather than substituting an in-memory store.
const source = transpileModule(readFileSync(resolve(__dirname, "../../../packages/spndrr-speech/src/indexeddb-storage.ts"), "utf8"), {
  compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ESNext },
}).outputText;

test("speech model storage commits bytes, survives reload and deletes only the selected version", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(async source => {
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    try {
      const { IndexedDbSpeechModelStorage } = await import(url);
      const store = new IndexedDbSpeechModelStorage();
      await store.put("model/test/1/file/encoder", { bytes: new Uint8Array([1, 2, 3]) });
      await store.put("model/test/2/file/encoder", { bytes: new Uint8Array([4, 5, 6]) });
      await store.put("installed/model/test/1/", { version: "1" });
      await store.put("installed/model/test/2/", { version: "2" });
    } finally { URL.revokeObjectURL(url); }
  }, source);
  await page.reload();
  const result = await page.evaluate(async source => {
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    try {
      const { IndexedDbSpeechModelStorage } = await import(url);
      const store = new IndexedDbSpeechModelStorage();
      const first = await store.get("model/test/1/file/encoder");
      const versions = await store.list("installed/");
      await store.removePrefix("model/test/1/");
      await store.removePrefix("installed/model/test/1/");
      const second = await store.get("model/test/2/file/encoder");
      return {
        bytesBeforeReload: Array.from(first.bytes),
        versions: versions.map((entry: { version: string }) => entry.version),
        deleted: await store.get("model/test/1/file/encoder") === undefined,
        remainingBytes: Array.from(second.bytes),
        remainingVersions: (await store.list("installed/")).map((entry: { version: string }) => entry.version),
      };
    } finally { URL.revokeObjectURL(url); }
  }, source);
  expect(result).toEqual({ bytesBeforeReload: [1, 2, 3], versions: ["1", "2"], deleted: true, remainingBytes: [4, 5, 6], remainingVersions: ["2"] });
});
