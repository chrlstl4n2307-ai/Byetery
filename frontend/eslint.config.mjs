import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: ["**/backend/**", "@stellar/stellar-sdk", "@stellar/stellar-sdk/**", "**/*signer*", "**/*secure-store*", "**/testnet/transport*"],
        paths: ["child_process", "node:child_process"],
      }],
    },
  },
  globalIgnores([
    ".next/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
  ]),
]);
