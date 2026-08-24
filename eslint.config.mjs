import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ["src/lib/country-signals/connectors/aguas-decima.ts"],
    rules: {
      "prefer-const": "off",
    },
  },
  globalIgnores([".next/**", "node_modules/**"]),
]);
