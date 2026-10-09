import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const tokens = text => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/u).filter(Boolean);
export function wordErrors(reference, hypothesis) {
  const expected = tokens(reference), actual = tokens(hypothesis);
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let i = 1; i <= expected.length; i++) {
    const current = [i];
    for (let j = 1; j <= actual.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(expected[i - 1] !== actual[j - 1]));
    previous = current;
  }
  return { errors: previous[actual.length], words: expected.length };
}

/** Amounts are independently annotated from actual transcripts by a reviewer, never guessed by this script. */
export function evaluateAccuracy(cases, results) {
  const index = new Map(results.map(result => [result.id, result]));
  if (index.size !== results.length || cases.length !== results.length || cases.some(item => !index.has(item.id))) throw new Error("Require one result per case, without missing or duplicate IDs.");
  const rows = cases.map(item => {
    const result = index.get(item.id);
    if (typeof result.text !== "string" || !Array.isArray(result.amounts) || result.amounts.some(amount => !Number.isFinite(amount)) || !Number.isFinite(result.latencyMs) || result.latencyMs < 0) throw new Error(`Invalid result for ${item.id}`);
    const amountCorrect = JSON.stringify(result.amounts) === JSON.stringify(item.amounts);
    const variants = [item.text, ...(item.alternatives ?? [])].map(text => wordErrors(text, result.text));
    const best = variants.sort((left, right) => left.errors / Math.max(left.words, 1) - right.errors / Math.max(right.words, 1))[0];
    return { id: item.id, silence: item.silence === true, critical: item.critical === true, amountCorrect,
      hallucination: item.silence === true && !!result.text.trim(), errors: best.errors, words: best.words, latencyMs: result.latencyMs };
  });
  const speech = rows.filter(row => !row.silence), amounts = rows.filter(row => cases.find(item => item.id === row.id).amounts.length > 0);
  const latency = speech.map(row => row.latencyMs).sort((a, b) => a - b);
  const exactAmountRate = amounts.length ? amounts.filter(row => row.amountCorrect).length / amounts.length : null;
  const criticalFailures = rows.filter(row => row.critical && (!row.amountCorrect || row.hallucination));
  const hallucinations = rows.filter(row => row.hallucination);
  const p95LatencyMs = latency.length ? latency[Math.ceil(latency.length * 0.95) - 1] : null;
  return { cases: rows.length, exactAmountRate, wordErrorRate: speech.reduce((total, row) => total + row.errors, 0) / Math.max(1, speech.reduce((total, row) => total + row.words, 0)),
    p95LatencyMs, criticalFailures: criticalFailures.map(row => row.id), silenceHallucinations: hallucinations.map(row => row.id),
    proposedGatePassed: exactAmountRate !== null && exactAmountRate >= 0.98 && criticalFailures.length === 0 && hallucinations.length === 0 && p95LatencyMs !== null && p95LatencyMs <= 3000, rows };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , manifest, results, output] = process.argv;
  if (!manifest || !results || !output) throw new Error("Usage: node evaluate-accuracy.mjs cases.json results.json report.json");
  const report = evaluateAccuracy(JSON.parse(await readFile(manifest, "utf8")), JSON.parse(await readFile(results, "utf8")));
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, rows: undefined }));
}
