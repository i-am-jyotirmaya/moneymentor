import assert from "node:assert/strict";
import { test } from "node:test";
import { recoverRupeeAmount } from "../lib/rupee-ocr.ts";

function workerFor({ text, digitText, confidence, croppedConfidence, firstWidth = 38, top = 350 }) {
  const symbols = [...text].map((character, index) => ({
    text: character,
    bbox: { x0: 250 + (index ? firstWidth + (index - 1) * 40 : 0), y0: top,
      x1: 250 + (index ? firstWidth + index * 40 : firstWidth), y1: top + 55 },
  }));
  const line = { text, confidence, bbox: { x0: 250, y0: top, x1: symbols.at(-1).bbox.x1, y1: top + 55 }, words: [{ symbols }] };
  return {
    async setParameters() {},
    async recognize(_image, _options, output) {
      if (output?.blocks) return { data: { blocks: [{ paragraphs: [{ lines: [line] }] }] } };
      return { data: { text: digitText, confidence: croppedConfidence } };
    },
  };
}

test("restores a rupee amount when its leading glyph was read as a digit", async () => {
  assert.equal(await recoverRupeeAmount(workerFor({ text: "3213.00", digitText: "213.00", confidence: 74, croppedConfidence: 95 }), new Blob(), 700, 2000), "₹213.00");
  assert.equal(await recoverRupeeAmount(workerFor({ text: "395", digitText: "95", confidence: 45, croppedConfidence: 95, top: 710 }), new Blob(), 740, 1600), "₹95");
});

test("never deletes a real leading digit or a fused symbol and digit", async () => {
  assert.equal(await recoverRupeeAmount(workerFor({ text: "3213.00", digitText: "213.00", confidence: 94, croppedConfidence: 95 }), new Blob(), 700, 2000), null);
  assert.equal(await recoverRupeeAmount(workerFor({ text: "213.00", digitText: "13.00", confidence: 57, croppedConfidence: 95, firstWidth: 116 }), new Blob(), 700, 1600), null);
});
