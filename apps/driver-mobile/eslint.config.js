// Mirrors apps/customer-mobile/eslint.config.js — minimal flat config
// (no eslint-config-expo flat export yet) + the typescript-eslint plugin
// loaded so disable comments referencing its rules don't throw
// "Definition for rule X was not found" errors.
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "dist/**",
      "web-build/**",
      "expo-env.d.ts",
      "babel.config.js",
      "metro.config.js",
      "eslint.config.js",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
