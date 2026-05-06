// Minimal flat ESLint config. `eslint-config-expo` 8.x still ships the
// legacy `.eslintrc` shape (no `/flat` export), and bridging it through
// FlatCompat brings in plugins that fight ESLint 9. Keeping the rule set
// minimal here is intentional: A4d-3 polish revisits and adds RN /
// react-hooks rules once the upstream config has a flat export.
//
// We DO register the typescript-eslint plugin (without enabling any
// rules) so eslint-disable comments referencing @typescript-eslint/*
// rules don't trigger ESLint 9's "definition for rule was not found"
// error. The rules stay off; the plugin presence is just for vocabulary.

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
