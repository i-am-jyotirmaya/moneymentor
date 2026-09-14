import { defineConfig, globalIgnores } from "eslint/config";
import webConfig from "../web/eslint.config.mjs";
export default defineConfig([...webConfig, globalIgnores(["android/**", "ios/**"])]);
