// Accessibility probes for the coverage suite. Everything here measures what a user gets
// (rendered boxes, computed colours, axe results), never class names.
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

export const wcag21AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

export type AxeFinding = { rule: string; impact: string | null | undefined; targets: string[] };

/** WCAG 2.1 A/AA axe scan. `only` / `skip` narrow it to (or away from) specific rule ids. */
export async function axeScan(page: Page, options: { only?: string[]; skip?: string[] } = {}): Promise<AxeFinding[]> {
  let builder = new AxeBuilder({ page }).withTags(wcag21AA);
  if (options.only) builder = builder.withRules(options.only);
  if (options.skip) builder = builder.disableRules(options.skip);
  const { violations } = await builder.analyze();
  return violations.map(violation => ({
    rule: violation.id,
    impact: violation.impact,
    targets: violation.nodes.slice(0, 8).map(node => node.target.join(" ")),
  }));
}

export type SmallTarget = { name: string; width: number; height: number };

/**
 * Every visible interactive element smaller than `min` CSS px in either dimension (audit A2).
 * Visually-hidden (1px sr-only) controls are ignored; they are not tap targets.
 */
export async function smallTargets(page: Page, min = 48): Promise<SmallTarget[]> {
  return page.evaluate((minimum) => {
    const selector = [
      "a[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary",
      "[role=button]", "[role=link]", "[role=checkbox]", "[role=combobox]", "[role=tab]",
      "[role=menuitem]", "[role=option]", "[role=switch]", "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const describe = (element: Element) => {
      const label = element.getAttribute("aria-label")
        ?? (element as HTMLInputElement).labels?.[0]?.textContent
        ?? element.textContent
        ?? "";
      return `${element.tagName.toLowerCase()} "${label.replace(/\s+/g, " ").trim().slice(0, 40)}"`;
    };
    const found: { name: string; width: number; height: number }[] = [];
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 1 || rect.height <= 1 || style.visibility === "hidden" || element.closest("[aria-hidden=true], [inert]")) continue;
      if (rect.width < minimum || rect.height < minimum) {
        found.push({ name: describe(element), width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    }
    return found;
  }, min);
}

export type PlaceholderContrast = { field: string; placeholder: string; background: string; ratio: number };

/** Contrast of each visible field's ::placeholder colour against the field's effective background (audit A3). */
export async function placeholderContrasts(page: Page): Promise<PlaceholderContrast[]> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    // The canvas normalises any CSS colour syntax (rgb, hex, oklch, color-mix) to sRGB bytes.
    const toRgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "#000";
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const over = (top: { r: number; g: number; b: number; a: number }, bottom: { r: number; g: number; b: number }) => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
    });
    const effectiveBackground = (element: Element | null) => {
      const layers: { r: number; g: number; b: number; a: number }[] = [];
      for (let node = element; node; node = node.parentElement) {
        const layer = toRgba(getComputedStyle(node).backgroundColor);
        if (layer.a > 0) layers.push(layer);
        if (layer.a >= 1) break;
      }
      return layers.reverse().reduce((base, layer) => over(layer, base), { r: 255, g: 255, b: 255 });
    };
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const channel = (value: number) => {
        const s = value / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const hex = ({ r, g, b }: { r: number; g: number; b: number }) =>
      `#${[r, g, b].map(value => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
    const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[placeholder], textarea[placeholder]"))
      .filter(field => field.placeholder.trim() && field.getClientRects().length > 0);
    return fields.map(field => {
      const background = effectiveBackground(field);
      const foreground = over(toRgba(getComputedStyle(field, "::placeholder").color), background);
      const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return {
        field: field.getAttribute("aria-label") ?? field.labels?.[0]?.textContent?.trim() ?? field.placeholder,
        placeholder: hex(foreground),
        background: hex(background),
        ratio: Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100,
      };
    });
  });
}

export type LabelBox = { label: string; left: number; right: number; top: number; bottom: number; clipped: boolean };

/**
 * The painted text box of each item in a navigation landmark, so overlap between
 * labels (audit T4: "TrackTransactio Dashboard" at 200%) can be detected.
 */
export async function navLabelBoxes(navigation: Locator): Promise<LabelBox[]> {
  return navigation.evaluate(nav => Array.from(nav.querySelectorAll("a, button")).map(item => {
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    const rects: DOMRect[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...Array.from(range.getClientRects()));
    }
    const box = rects.reduce(
      (acc, rect) => ({ left: Math.min(acc.left, rect.left), right: Math.max(acc.right, rect.right), top: Math.min(acc.top, rect.top), bottom: Math.max(acc.bottom, rect.bottom) }),
      { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity },
    );
    const clipped = Array.from(item.querySelectorAll("*")).concat(item).some(element =>
      element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX !== "visible");
    return { label: item.textContent?.trim() ?? "", ...box, clipped };
  }));
}

export function overlappingPairs(boxes: LabelBox[]) {
  const pairs: string[] = [];
  boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => {
    const overlap = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    if (overlap) pairs.push(`${a.label} × ${b.label}`);
  }));
  return pairs;
}
