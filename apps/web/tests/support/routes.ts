// The 12 app routes (apps/web/app, re-exported by apps/mobile/app) and what each must expose to
// assistive tech. Names are accessible names, so the redesign can restyle freely without touching this.
import type { Page } from "@playwright/test";
import { mockBackend, seedAuthSession } from "./mock-backend";
import { mockNoActiveJudgements, mockRegistration } from "./scenarios";

export type FormFactor = "mobile" | "desktop";

export type Viewport = { name: string; width: number; height: number; formFactor: FormFactor };

/** Widths from the design audit: three phone widths plus the 1440 desktop layout. */
export const viewports: Viewport[] = [
  { name: "320", width: 320, height: 640, formFactor: "mobile" },
  { name: "360", width: 360, height: 800, formFactor: "mobile" },
  { name: "412", width: 412, height: 915, formFactor: "mobile" },
  { name: "1440", width: 1440, height: 900, formFactor: "desktop" },
];

export const mobileViewports = viewports.filter(viewport => viewport.formFactor === "mobile");

const pixel5UserAgent =
  "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36";

/** Context options for test.use(): phones emulate touch like the Pixel 5 project, desktop does not. */
export function contextFor(viewport: Viewport) {
  const size = { width: viewport.width, height: viewport.height };
  return viewport.formFactor === "mobile"
    ? { viewport: size, screen: size, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: pixel5UserAgent }
    : { viewport: size, screen: size, isMobile: false, hasTouch: false, deviceScaleFactor: 1 };
}

export type Control = {
  role: "button" | "link" | "textbox" | "combobox" | "spinbutton" | "checkbox";
  name: string | RegExp;
  only?: FormFactor;
};

export type AppRoute = {
  path: string;
  /** Short id used in test titles and screenshot names. */
  id: string;
  kind: "workspace" | "public";
  heading: Record<FormFactor, string>;
  controls: Control[];
  /** Destination reached through the route's primary navigation. */
  navigatesTo: { linkName: string; url: RegExp; heading: Record<FormFactor, string> };
};

/** Desktop sidebar and mobile drawer order, from workspace-config.tsx. */
export const workspaceNavLinks = ["Dashboard", "Assistant", "Transactions", "Judgments", "Planning", "Household", "Settings"];
/** The phone bottom bar ("Track" is the assistant; see audit N1). */
export const quickNavLinks = ["Track", "Transactions", "Dashboard"];

const toTransactions = { linkName: "Transactions", url: /\/transactions\/?$/, heading: { mobile: "Transactions", desktop: "Transactions" } };
const toDashboard = { linkName: "Dashboard", url: /\/dashboard\/?$/, heading: { mobile: "Dashboard", desktop: "Dashboard" } };

export const appRoutes: AppRoute[] = [
  {
    path: "/", id: "home", kind: "workspace",
    // Audit N3: phones open the assistant, desktop opens the dashboard.
    heading: { mobile: "Assistant", desktop: "Dashboard" },
    controls: [
      { role: "textbox", name: "Message Spndrr", only: "mobile" },
      { role: "button", name: "Send message", only: "mobile" },
      { role: "button", name: "Start voice input", only: "mobile" },
      { role: "combobox", name: "Dashboard month", only: "desktop" },
      { role: "button", name: "Open assistant chat", only: "desktop" },
      { role: "combobox", name: "Household" },
    ],
    navigatesTo: toTransactions,
  },
  {
    path: "/assistant", id: "assistant", kind: "workspace",
    heading: { mobile: "Assistant", desktop: "What did you spend or receive?" },
    controls: [
      { role: "textbox", name: "Message Spndrr" },
      { role: "button", name: "Send message" },
      { role: "button", name: "Start voice input" },
      { role: "combobox", name: "Household" },
    ],
    navigatesTo: toTransactions,
  },
  {
    path: "/dashboard", id: "dashboard", kind: "workspace",
    heading: { mobile: "Dashboard", desktop: "Dashboard" },
    controls: [
      { role: "button", name: "Previous dashboard month" },
      { role: "combobox", name: "Dashboard month" },
      { role: "link", name: "Track a transaction" },
      { role: "link", name: "Review judgments" },
    ],
    navigatesTo: toTransactions,
  },
  {
    path: "/transactions", id: "transactions", kind: "workspace",
    heading: { mobile: "Transactions", desktop: "Transactions" },
    controls: [
      { role: "button", name: "Previous transaction month" },
      { role: "combobox", name: "Transaction month" },
      { role: "button", name: "Next transaction page" },
      { role: "button", name: /^Edit transaction / },
      { role: "button", name: /^Delete transaction / },
    ],
    navigatesTo: toDashboard,
  },
  {
    path: "/reports", id: "reports", kind: "workspace",
    heading: { mobile: "Judgments", desktop: "Judgments" },
    controls: [{ role: "combobox", name: "Household" }],
    navigatesTo: toTransactions,
  },
  {
    path: "/planning", id: "planning", kind: "workspace",
    heading: { mobile: "Planning", desktop: "Planning" },
    controls: [
      { role: "textbox", name: "Goal" },
      { role: "spinbutton", name: "Target amount" },
      { role: "combobox", name: "Goal type" },
      { role: "checkbox", name: "Share with household" },
      { role: "button", name: "Create goal" },
    ],
    navigatesTo: toTransactions,
  },
  {
    path: "/household", id: "household", kind: "workspace",
    heading: { mobile: "Household", desktop: "Household" },
    controls: [
      { role: "button", name: "Accept" },
      { role: "button", name: "Decline" },
      { role: "textbox", name: "Household name" },
      { role: "button", name: "Create household" },
      { role: "combobox", name: "Role" },
      { role: "button", name: "Send invitation" },
    ],
    navigatesTo: toTransactions,
  },
  {
    path: "/settings", id: "settings", kind: "workspace",
    heading: { mobile: "Settings", desktop: "Settings" },
    controls: [
      { role: "textbox", name: "Default currency" },
      { role: "combobox", name: "Default visibility" },
      { role: "button", name: "Save settings" },
      { role: "button", name: "Export my data" },
      { role: "button", name: "Delete my account" },
      { role: "button", name: "Add account" },
    ],
    navigatesTo: toTransactions,
  },
  {
    path: "/login", id: "login", kind: "public",
    heading: { mobile: "Sign in", desktop: "Sign in" },
    controls: [
      { role: "textbox", name: "Email" },
      { role: "textbox", name: "Password" },
      { role: "button", name: "Sign in" },
    ],
    navigatesTo: { linkName: "Create a new account", url: /\/signup\/?$/, heading: { mobile: "Create your account", desktop: "Create your account" } },
  },
  {
    path: "/signup", id: "signup", kind: "public",
    heading: { mobile: "Create your account", desktop: "Create your account" },
    controls: [
      { role: "textbox", name: "Display name" },
      { role: "textbox", name: "Email" },
      { role: "textbox", name: "Password" },
      { role: "checkbox", name: /I accept the beta privacy policy/ },
      { role: "button", name: "Create account" },
    ],
    navigatesTo: { linkName: "I already have an account", url: /\/login\/?$/, heading: { mobile: "Sign in", desktop: "Sign in" } },
  },
  {
    path: "/request-access", id: "request-access", kind: "public",
    heading: { mobile: "Request MVP access", desktop: "Request MVP access" },
    controls: [
      { role: "textbox", name: "Display name" },
      { role: "textbox", name: "Email" },
      { role: "textbox", name: "Why would you like access? (optional)" },
      { role: "button", name: "Request MVP access" },
    ],
    navigatesTo: { linkName: "I already have an account", url: /\/login\/?$/, heading: { mobile: "Sign in", desktop: "Sign in" } },
  },
  {
    path: "/privacy", id: "privacy", kind: "public",
    heading: { mobile: "Spndrr beta privacy policy", desktop: "Spndrr beta privacy policy" },
    // The address comes from NEXT_PUBLIC_SUPPORT_EMAIL, so match any support@ mailbox.
    controls: [{ role: "link", name: /^support@/ }],
    navigatesTo: { linkName: "Return to Spndrr", url: /\/$/, heading: { mobile: "Spndrr", desktop: "Spndrr" } },
  },
];

export const routeById = (id: string) => {
  const route = appRoutes.find(candidate => candidate.id === id);
  if (!route) throw new Error(`Unknown route ${id}`);
  return route;
};

/**
 * Mocked API for a route. Workspace routes are signed in (mockBackend's refresh succeeds);
 * public routes are signed out with registration Open so /signup renders its form.
 */
export async function prepareRoute(page: Page, route: AppRoute) {
  await seedAuthSession(page);
  await mockBackend(page);
  await mockNoActiveJudgements(page);
  if (route.kind === "public") await mockRegistration(page, "Open");
}

/** Navigate and wait until the route's primary heading is on screen. */
export async function openRoute(page: Page, route: AppRoute, formFactor: FormFactor) {
  await page.goto(route.path);
  await page.getByRole("heading", { name: route.heading[formFactor], exact: true }).first().waitFor();
}
