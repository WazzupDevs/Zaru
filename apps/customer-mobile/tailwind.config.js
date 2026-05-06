// Tailwind config — Node-loaded by NativeWind/Tailwind, so plain CJS keeps
// the loader path simple and avoids the @typescript-eslint/no-require-imports
// rule that fires when require() lives in a .ts file.
//
// Placeholder brand palette — Mercedes-vintage wedding-car visual world:
//   primary  #1a1a1a  classic black, premium feel
//   accent   #d4af37  gold (wedding symbology)
//   surface  #fafafa  near-white background
// A4d-3 polish swaps these once the real brand identity lands. The token
// names (primary / accent / surface / muted / danger / success) are stable
// so swapping the hex values is the only change needed downstream.

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#1a1a1a",
          accent: "#d4af37",
          surface: "#fafafa",
          muted: "#6b7280",
          danger: "#dc2626",
          success: "#16a34a",
        },
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
