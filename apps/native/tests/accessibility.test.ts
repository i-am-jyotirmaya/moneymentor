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

test.each([
  ["src/ui/AuthForm.tsx", "login-screen"],
  ["src/ui/AuthForm.tsx", "login-email"],
  ["src/ui/AuthForm.tsx", "login-password"],
  ["src/ui/AuthForm.tsx", "login-submit"],
  ["app/(tabs)/settings.tsx", "settings-sign-out"],
  ["src/workspace/shell.tsx", "menu-sign-out"],
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

test.each(["reports", "planning", "household", "settings"])(
  "More sheet exposes menu-%s",
  section => {
    expect(source("src/workspace/shell.tsx")).toContain('testID={`menu-${item.section}`}');
    expect(source("src/workspace/navigation.ts")).toContain(`section: '${section}'`);
    expect(source(".maestro/signin.yaml")).toContain(`id: "menu-${section}"`);
  },
);

test("Maestro labels credential input steps instead of displaying their resolved values", () => {
  const flow = source(".maestro/signin.yaml");
  for (const credential of ["EMAIL", "PASSWORD"]) {
    const variable = `\\$\\{MAESTRO_TEST_${credential}\\}`;
    expect(flow).toMatch(new RegExp(`inputText:\\s*\\n\\s+text: ["']${variable}["']\\n\\s+label: ["'][^"'\\n]+["']`));
    expect(flow).not.toMatch(new RegExp(`inputText:\\s*["']${variable}["']`));
  }
});
