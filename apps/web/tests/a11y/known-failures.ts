// Checks that fail on the current UI, keyed by check and "<route>@<width>", each with the
// finding in the design audit (spndrr AUDIT.md, ForgeDesigner's baseline at 6e89646) that explains it.
// They run as test.fail(): when the redesign fixes one, Playwright reports it as
// "expected to fail, but passed". Delete the entry then.
import { test } from "@playwright/test";

export type Check =
  | "axe" | "contrast" | "targets" | "h1" | "placeholder" | "error-state" | "font-200"
  | "drawer-escape" | "drawer-outside" | "drawer-focus" | "readonly-composer";

const allRoutes = ["home", "assistant", "dashboard", "transactions", "reports", "planning", "household", "settings", "login", "signup", "request-access", "privacy"];
const phones = ["320", "360", "412"];

function entries(routes: string[], widths: string[], finding: string): Record<string, string> {
  return Object.fromEntries(routes.flatMap(route => widths.map(width => [`${route}@${width}`, finding])));
}

export const knownFailures: Record<Check, Record<string, string>> = {
  // WCAG 2.1 A/AA axe checks, including contrast, pass at every tested width.
  axe: {},
  contrast: {},

  targets: entries(allRoutes, phones,
    "AUDIT A2: touch targets under 48dp (menu/close 40x40, month arrows and row actions 36x36, voice 44x44, household selector 44px tall, 13px checkboxes, inline links)"),

  h1: {
    ...entries(["privacy"], ["360", "1440"], "AUDIT A5: privacy puts the 'AI goal planning' <h2> before its <h1>"),
  },

  placeholder: {},

  "error-state": {
    ...entries(["transactions"], ["360", "1440"], "AUDIT S1: the 'Server error' banner shows together with 'No transactions found' / 'Trash is empty'"),
    ...entries(["dashboard", "household", "settings"], ["360", "1440"], "AUDIT S2: the error banner sits above a SectionSkeleton that keeps loading forever"),
  },

  "font-200": entries(["assistant", "dashboard", "transactions"], ["360"],
    "AUDIT T4: at 200% font size the bottom-nav labels overlap ('TrackTransactio Dashboard')"),

  "drawer-escape": {},
  "drawer-outside": {},
  "drawer-focus": {},

  "readonly-composer": entries(["assistant"], ["360", "1440"],
    "AUDIT S7: in a Viewer household the Assistant textarea, send and mic stay enabled (audit saw it at 360; this suite confirms 1440)"),
};

export function expectKnownFailure(check: Check, key: string) {
  const finding = knownFailures[check][key];
  test.fail(Boolean(finding), finding);
}
