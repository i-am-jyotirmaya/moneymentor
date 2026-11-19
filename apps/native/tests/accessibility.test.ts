import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("native source does not use the unsupported status accessibility role", () => {
  for (const directory of ["app", "src"]) {
    const root = join(__dirname, "..", directory);
    for (const file of readdirSync(root, { recursive: true, encoding: "utf8" })) {
      if (/\.[jt]sx?$/.test(file)) {
        expect(readFileSync(join(root, file), "utf8")).not.toMatch(
          /accessibilityRole\s*=\s*(?:["']status["']|\{\s*["']status["']\s*\})/,
        );
      }
    }
  }
});

const source = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");

test('Settings reserves the dock outside its scroll viewport', () => {
  expect(source('app/(tabs)/settings.tsx')).toContain('style={[ws.fill, { marginBottom: dock }]}');
});

test('Planning uses the same Judgment spelling as the navigation', () => {
  const planning = source('app/(tabs)/planning.tsx');
  expect(planning).toContain("['Judgments', judgements.length]");
  expect(planning).not.toContain("'Judgements'");
});

test.each([
  ["src/ui/AuthForm.tsx", "login-screen"],
  ["src/ui/AuthForm.tsx", "login-email"],
  ["src/ui/AuthForm.tsx", "login-password"],
  ["src/ui/AuthForm.tsx", "login-submit"],
  ["app/(tabs)/settings.tsx", "settings-sign-out"],
  ["app/index.tsx", "home-screen"],
  ["app/index.tsx", "home-login-button"],
  ...["assistant", "transactions", "dashboard", "reports", "planning", "household", "settings"].map(
    section => [`app/(tabs)/${section}.tsx`, `${section}-screen`],
  ),
])("%s preserves Maestro selector %s", (file, id) => {
  expect(source(file)).toMatch(new RegExp(`testID=\\{?[^>]*["']${id}["']`));
});

test.each(["assistant", "transactions", "dashboard"])(
  "bottom navigation preserves nav-%s",
  section => {
    const shell = source("src/workspace/shell.tsx");
    expect(shell).toContain('bottomSections.map(section =>');
    expect(shell).toContain('<NavDock routes={dockRoutes}');
    expect(source("src/workspace/NavDock.tsx")).toContain('testID={`nav-${route.key}`}');
    const navigation = source("src/workspace/navigation.ts");
    expect(navigation.match(/bottomSections\s*=\s*\[([^\]]+)\]/)?.[1]).toContain(`'${section}'`);
  },
);

test("the dock keeps the Maestro selector nav-more", () => {
  expect(source("src/workspace/shell.tsx")).toContain("{ key: 'more', label: 'More'");
  expect(source("src/workspace/NavDock.tsx")).toContain('testID={`nav-${route.key}`}');
});

test.each([["reports", "Judgments"], ["planning", "Planning"], ["household", "Household"], ["settings", "Settings"]])(
  "More sheet exposes %s as the %s row",
  (section, label) => {
    // A4's MoreSheet rows carry no testID, so Maestro selects them by title.
    expect(source("src/workspace/shell.tsx")).toContain("<MoreSheet");
    expect(source("src/workspace/more-data.ts")).toContain(`key: '${section}'`);
    expect(source("src/workspace/more-data.ts")).toContain(`label: '${label}'`);
    expect(source("src/workspace/navigation.ts")).toContain(`section: '${section}'`);
    expect(source(".maestro/signin.yaml")).toContain(`text: "${label}"`);
  },
);
