import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { whisperTiny } from "../src/catalog.ts";

const directory = resolve(process.argv[2] ?? "/tmp/spndrr-speech-fixtures");
for (const file of whisperTiny.files) {
  const path = resolve(directory, file.path);
  const existing = await readFile(path).catch(() => undefined);
  if (existing && createHash("sha256").update(existing).digest("hex") === file.sha256) continue;
  const response = await fetch(file.url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Fixture download failed: ${response.status} ${file.path}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== file.bytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error(`Fixture integrity failed: ${file.path}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  console.log(`Verified ${file.path}`);
}
const response = await fetch("https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav", { signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error("Audio fixture download failed.");
await writeFile(resolve(directory, "jfk.wav"), Buffer.from(await response.arrayBuffer()));
const common = ["-hide_banner", "-loglevel", "error", "-y"];
execFileSync("ffmpeg", [...common, "-i", resolve(directory, "jfk.wav"), "-f", "f32le", "-ar", "16000", "-ac", "1", resolve(directory, "jfk.pcm")]);
execFileSync("ffmpeg", [...common, "-f", "lavfi", "-i", "flite=text=spent four hundred and fifty rupees on dinner:voice=slt", "-f", "f32le", "-ar", "16000", "-ac", "1", resolve(directory, "expense.pcm")]);
// A clear first word, a natural pause, then quieter speech reproduces premature endpointing.
const synth = (text) => {
  const bytes = execFileSync("ffmpeg", [...common, "-f", "lavfi", "-i", `flite=text=${text}:voice=slt`, "-f", "f32le", "-ar", "16000", "-ac", "1", "pipe:1"]);
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
const first = synth("spent");
const rest = synth("four hundred and fifty rupees on dinner");
const paused = new Float32Array(first.length + 16000 * 1.2 + rest.length);
paused.set(first);
paused.set(rest.map(value => value * 0.12), first.length + 16000 * 1.2);
await writeFile(resolve(directory, "paused-expense.pcm"), new Uint8Array(paused.buffer));
console.log(`Speech acceptance fixtures: ${directory}`);
