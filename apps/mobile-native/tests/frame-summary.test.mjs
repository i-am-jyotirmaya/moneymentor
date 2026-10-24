import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeFrames } from '../scripts/summarize-frame-stats.mjs';

test('frame reporting separates package counters from valid retained tail phases', () => {
  const result = summarizeFrames(`Total frames rendered: 1000
Janky frames: 250 (25.00%)
50th percentile: 16ms
95th percentile: 48ms
99th percentile: 85ms
---PROFILEDATA---
Flags,IntendedVsync,HandleInputStart,SyncQueued,IssueDrawCommandsStart,SwapBuffers,FrameCompleted,
0,1000000000,1001000000,1004000000,1005000000,1010000000,1030000000,
1,1000000000,1001000000,1004000000,1005000000,1010000000,1999000000,
---PROFILEDATA---
Total frames rendered: 999`);
  assert.equal(result.totalFrames, 1000); assert.equal(result.jankyPercent, 25);
  assert.equal(result.tail.retainedFrames, 1); assert.equal(result.tail.mainUiWorkMs.p95, 3);
  assert.equal(result.tail.renderCommandMs.p95, 5); assert.equal(result.tail.afterSwapToCompletionMs.p95, 20);
  assert.equal(result.tail.totalFromVsyncMs.p95, 30); assert.equal(result.frameMs.p95, 48);
});
test('missing counters are unknown, not false zero-performance claims', () => {
  const result = summarizeFrames('No graphics process available.');
  assert.equal(result.totalFrames, null); assert.equal(result.jankyPercent, null);
  assert.equal(result.tail.retainedFrames, 0); assert.equal(result.tail.mainUiWorkMs.p95, null);
});
test('invalid/sentinel and negative tail durations do not enter percentiles', () => {
  const result = summarizeFrames(`---PROFILEDATA---
Flags,HandleInputStart,SyncQueued,IssueDrawCommandsStart,SwapBuffers,FrameCompleted,
0,10000000,1,20,9223372036854775807,30,
---PROFILEDATA---`);
  assert.equal(result.tail.retainedFrames, 1); assert.equal(result.tail.mainUiWorkMs.samples, 0);
  assert.equal(result.tail.renderCommandMs.p95, null); assert.equal(result.tail.afterSwapToCompletionMs.p95, null);
});
