// React / React Native / Next overlay.
// Apps add their framework-specific plugin (eslint-plugin-react, next, etc).

import base from "./index.js";
import globals from "globals";

export default [
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
];
