import type { Config } from "tailwindcss";

const config: Config = {
  // shadcn/ui-friendly defaults: dark mode via class, content scan from
  // the App Router structure, CSS-variable theme. shadcn install (A3b)
  // will add component glob to `content` and theme.extend tokens.
  darkMode: ["class"],
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {},
  },
  plugins: [],
};

export default config;
