import type { Worker } from "tesseract.js";

/** Recover a large amount line when the English OCR model reads ₹ as a digit. */
export async function recoverRupeeAmount(
  worker: Worker,
  image: Blob,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<string | null> {
  // Payment screenshots are portrait. Avoid scanning receipts and small images.
  if (width < 250 || height < width * 1.2) return null;
  const { PSM } = await import("tesseract.js");
  const candidates: { text: string; confidence: number; first: number; box: { x0: number; y0: number; x1: number; y1: number } }[] = [];
  const left = Math.floor(width * 0.18);
  const stripWidth = Math.floor(width * 0.64);
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  try {
    // Narrow overlapping bands isolate the headline amount from surrounding UI.
    for (let percent = 11; percent <= 49; percent += 3) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const top = Math.floor(height * percent / 100);
      const { data } = await worker.recognize(image, {
        rectangle: { left, top, width: stripWidth, height: Math.min(height - top, Math.ceil(height * 0.07)) },
      }, { blocks: true });
      for (const line of data.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? []) {
        const text = line.text.replace(/\s/g, "").trim();
        const symbols = line.words.flatMap(word => word.symbols);
        if (!/^[₹¥TtRr23]?\d{1,7}(?:[.,]\d{1,2})?$/.test(text) || symbols.length < 2
            || line.bbox.y1 - line.bbox.y0 < width * 0.055) continue;
        // OCR sometimes combines ₹ and the first real digit into one wide
        // symbol. Cropping that symbol would discard a digit, so leave it alone.
        const digitWidths = symbols.slice(1).filter(symbol => /\d/.test(symbol.text))
          .slice(0, 3).map(symbol => symbol.bbox.x1 - symbol.bbox.x0).sort((a, b) => a - b);
        if (!digitWidths.length || symbols[0].bbox.x1 - symbols[0].bbox.x0 > digitWidths[Math.floor(digitWidths.length / 2)] * 1.5) continue;
        candidates.push({ text, confidence: line.confidence, first: symbols[0].bbox.x1, box: line.bbox });
      }
    }
    // Re-read without the first glyph. A much clearer numeric suffix indicates
    // that the first glyph was likely the rupee sign, not a leading digit.
    for (const candidate of candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 4)) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const cropLeft = candidate.first + 1;
      const cropTop = Math.max(0, candidate.box.y0 - 12);
      const { data } = await worker.recognize(image, { rectangle: {
        left: cropLeft, top: cropTop,
        width: Math.min(width - cropLeft, candidate.box.x1 - cropLeft + 14),
        height: Math.min(height - cropTop, candidate.box.y1 - cropTop + 14),
      } });
      const digits = data.text.trim().replace(/\s/g, "").replace(",", ".");
      if (/^\d{1,7}(?:\.\d{1,2})?$/.test(digits)
          && candidate.text.replace(",", ".").endsWith(digits)
          && data.confidence >= 65 && data.confidence >= candidate.confidence + 12) {
        return `₹${digits}`;
      }
    }
    return null;
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  }
}
