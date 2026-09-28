import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { mkdir, copyFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = process.argv[2] ?? "web";
if (!["web", "mobile"].includes(app)) throw new Error("Unknown app");
const require = createRequire(resolve(root, "apps", app, "package.json"));
const tesseract = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(createRequire(resolve(tesseract, "package.json")).resolve("tesseract.js-core/package.json"));
const language = dirname(require.resolve("@tesseract.js-data/eng/package.json"));
const destination = resolve(root, "apps", app, "public/ocr");
await mkdir(resolve(destination, "core"), { recursive: true });
await mkdir(resolve(destination, "lang"), { recursive: true });
await copyFile(resolve(tesseract, "dist/worker.min.js"), resolve(destination, "worker.min.js"));
for (const file of await readdir(core)) {
  if (/\.wasm(?:\.js)?$/.test(file)) await copyFile(resolve(core, file), resolve(destination, "core", file));
}
await copyFile(resolve(language, "4.0.0_best_int/eng.traineddata.gz"), resolve(destination, "lang/eng.traineddata.gz"));
console.log(`Prepared local OCR assets for ${app}.`);
