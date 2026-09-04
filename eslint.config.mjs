import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ESLint's flat config does not read .gitignore automatically, so
    // non-project directories must be excluded explicitly. Without this,
    // eslint also tries to parse vendored/minified JS bundled inside the
    // Python virtual environment (e.g. Streamlit's static assets), which
    // can exhaust the Node heap.
    ".venv/**",
    ".sites-runtime/**",
    ".vinext/**",
    ".wrangler/**",
    "dist/**",
  ]),
]);

export default eslintConfig;
