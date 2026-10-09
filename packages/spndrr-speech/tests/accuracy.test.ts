import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Benchmark CLI is JavaScript with runtime validation.
import { evaluateAccuracy } from "../scripts/evaluate-accuracy.mjs";

test("accuracy gate treats wrong amounts independently from word error rate and rejects invented silence", () => {
  const cases = [{ id: "coffee", text: "bought coffee for 30 rupees", amounts: [30], critical: true }, { id: "silence", text: "", amounts: [], silence: true }];
  const report = evaluateAccuracy(cases, [{ id: "coffee", text: "bought coffee for 300 rupees", amounts: [300], latencyMs: 1200 }, { id: "silence", text: "hello", amounts: [], latencyMs: 100 }]);
  assert.equal(report.exactAmountRate, 0); assert.equal(report.proposedGatePassed, false);
  assert.deepEqual(report.criticalFailures, ["coffee"]); assert.deepEqual(report.silenceHallucinations, ["silence"]);
  assert.throws(() => evaluateAccuracy(cases, [{ id: "coffee", text: "", amounts: [], latencyMs: 1 }]));
});
