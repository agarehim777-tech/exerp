import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

// Kept deliberately small: the goal is to catch broken references and hook
// mistakes while App.jsx is split into modules, not to restyle the codebase.
export default [
  { ignores: ["dist/**", "node_modules/**", "supabase/functions/**", "public/sw.js", "**/*.ts", "**/*.tsx"] },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "no-undef": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true, varsIgnorePattern: "^[A-Z_]", caughtErrors: "none" }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["src/**/*.test.{js,jsx}", "src/test/**/*.{js,jsx}"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
];
