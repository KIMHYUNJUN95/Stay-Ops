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
    // Dev-only Node.js scripts — not subject to Next.js/TS lint rules
    "scripts/**",
    // 디자인 핸드오프 산출물(standalone HTML + 그 자산). git 추적 대상도 아니고 앱 코드도
    // 아닌데 린트에 잡혀 경고 5건을 내고 있었다 — 그 경고는 고칠 대상이 아니라 소음이다.
    ".handoff/**",
  ]),
]);

export default eslintConfig;
