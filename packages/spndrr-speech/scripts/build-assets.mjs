import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, copyFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { speechRuntimeId } from "../src/catalog.ts";

// Resolve dependencies from the app, including independent Docker installs.
const require = createRequire(resolve("package.json"));
const { build } = require("esbuild");
const runtime = dirname(require.resolve("@huggingface/transformers"));
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const destination = resolve("public/speech", speechRuntimeId);
await mkdir(destination, { recursive: true });
await build({
  entryPoints: [resolve(root, "apps/web/lib/speech/whisper-worker.ts")],
  outfile: resolve(destination, "worker.js"),
  bundle: true, platform: "browser", format: "esm", target: "es2022", minify: true,
  alias: { "@huggingface/transformers": resolve(runtime, "transformers.web.js") },
});
await copyFile(resolve(root, "apps/web/public/speech/pcm-worklet.js"), resolve(destination, "pcm-worklet.js"));
const notices = await Promise.all([
  readFile(resolve(runtime, "../LICENSE"), "utf8"),
  ...["whisper-LICENSE.txt", "onnx-LICENSE.txt", "onnx-ThirdPartyNotices.txt"].map(name => readFile(resolve(root, "packages/spndrr-speech/licenses", name), "utf8")),
]);
await writeFile(resolve(destination, "licenses.txt"), notices.join("\n\n"));
const names = ["worker.js", "pcm-worklet.js", "licenses.txt", "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"];
for (const name of names.slice(3)) await copyFile(resolve(runtime, name), resolve(destination, name));
const files = await Promise.all(names.map(async path => {
  const bytes = await readFile(resolve(destination, path));
  return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}));
await writeFile(resolve(destination, "runtime.json"), JSON.stringify({ id: speechRuntimeId, files }));
console.log(`Built local speech assets (${(files.reduce((n, f) => n + f.bytes, 0) / 1048576).toFixed(1)} MiB).`);
