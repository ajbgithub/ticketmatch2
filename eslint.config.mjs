// eslint.config.mjs

import next from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: ["**/node_modules/**", ".next/**"],
  },
  ...next,
  // ✅ Our overrides (placed after `next` so they win)
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];
