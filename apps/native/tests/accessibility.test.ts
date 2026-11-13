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
  ["src/workspace/shell.tsx", "nav-more"],
])("%s preserves Maestro selector %s", (file, id) => {
  expect(source(file)).toMatch(new RegExp(`testID=\\{?[^>]*["']${id}["']`));
});

test.each(["assistant", "transactions", "dashboard"])(
  "bottom navigation preserves nav-%s",
  section => {
    const shell = source("src/workspace/shell.tsx");
    expect(shell).toContain('bottomSections.map(section =>');
    expect(shell).toContain('testID={`nav-${section}`}');
    const navigation = source("src/workspace/navigation.ts");
    expect(navigation.match(/bottomSections\s*=\s*\[([^\]]+)\]/)?.[1]).toContain(`'${section}'`);
  },
);
