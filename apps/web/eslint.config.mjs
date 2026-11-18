// Next.js ships flat configs: core-web-vitals (React, hooks, a11y, Next rules) + TypeScript rules.
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...nextVitals,
  ...nextTs,
];

export default config;
