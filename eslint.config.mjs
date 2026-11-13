import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  { ignores: [".claude/**", ".next/**", "node_modules/**", "coverage/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];
