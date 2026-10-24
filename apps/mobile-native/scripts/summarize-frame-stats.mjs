import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const distribution = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = fraction => sorted.length ? Math.round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] * 100) / 100 : null;
  return { samples: sorted.length, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) };
};
/** Package-wide counters plus the retained tail window. Never label this a full CPU/GPU trace. */
export function summarizeFrames(text) {
  const number = pattern => { const found = pattern.exec(text); return found ? Number(found[1]) : null; };
  const section = text.split('---PROFILEDATA---')[1]?.trim().split(/\r?\n/) ?? [];
  const names = section[0]?.split(',') ?? [];
  const rows = section.slice(1).filter(line => /^\d+,/.test(line)).map(line => Object.fromEntries(line.split(',').map((value, index) => [names[index], Number(value)])))
    .filter(row => row.Flags === 0);
  const duration = (row, start, end) => {
    const value = (row[end] - row[start]) / 1e6;
    return Number.isFinite(value) && value >= 0 && value < 10000 ? value : Number.NaN;
  };
  return {
    totalFrames: number(/Total frames rendered: (\d+)/), jankyFrames: number(/Janky frames: (\d+)/),
    jankyPercent: number(/Janky frames: \d+ \(([\d.]+)%\)/),
    frameMs: { p50: number(/50th percentile: (\d+)ms/), p95: number(/95th percentile: (\d+)ms/), p99: number(/99th percentile: (\d+)ms/) },
    tail: { retainedFrames: rows.length,
      mainUiWorkMs: distribution(rows.map(row => duration(row, 'HandleInputStart', 'SyncQueued'))),
      renderCommandMs: distribution(rows.map(row => duration(row, 'IssueDrawCommandsStart', 'SwapBuffers'))),
      afterSwapToCompletionMs: distribution(rows.map(row => duration(row, 'SwapBuffers', 'FrameCompleted'))),
      totalFromVsyncMs: distribution(rows.map(row => duration(row, 'IntendedVsync', 'FrameCompleted'))),
    },
    caveat: 'Tail samples are not the complete scenario. Main-UI work is not JavaScript-thread CPU time; after-swap time is not a direct GPU measurement. Software-emulator results do not establish device FPS.',
  };
}
export function summarizeEvidence(directory) {
  const read = name => { const file = path.join(directory, name); return existsSync(file) ? readFileSync(file, 'utf8') : ''; };
  return { version: 1, coldActivityMs: Number(/TotalTime: (\d+)/.exec(read('activity-start.txt'))?.[1]) || null,
    scenarios: Object.fromEntries(['transaction', 'workspace', 'performance'].map(name => {
      const memory = read(`${name}-memory.txt`); const frames = read(`${name}-frames.txt`);
      return [name, { frames: frames ? summarizeFrames(frames) : null,
        memoryKB: { pss: Number(/TOTAL PSS:\s+(\d+)/.exec(memory)?.[1]) || null, rss: Number(/TOTAL RSS:\s+(\d+)/.exec(memory)?.[1]) || null } }];
    })) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw Error('Provide the directory of native emulator evidence.');
  console.log(JSON.stringify(summarizeEvidence(process.argv[2]), null, 2));
}
