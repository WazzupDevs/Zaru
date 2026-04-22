// Node-specific overlay for backend (NestJS, scripts, workers).

import base from "./index.js";
import globals from "globals";

export default [
  ...base,
  {
    files: ["**/*.{ts,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // NestJS uses constructor parameter properties heavily.
      "@typescript-eslint/parameter-properties": "off",
      // Decorators are everywhere in Nest.
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
];
