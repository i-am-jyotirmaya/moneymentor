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
