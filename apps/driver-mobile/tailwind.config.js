// Driver-app brand placeholder — same token shape as customer mobile
// (brand.{primary, accent, surface, muted, danger, success}) so future
// shared components don't need swap logic. The accent flips from gold
// (customer's wedding/event tone) to safety-green (driver's "active /
// online / go" semantic). Two extra tokens drive the online/offline
// status pill on the home screen — A4f-1b wires the toggle.
//
// A4g real brand identity revisits all six.

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#0a0a0a",
          accent: "#4ade80",
          surface: "#fafafa",
          muted: "#6b7280",
          danger: "#dc2626",
          success: "#16a34a",
          online: "#22c55e",
          offline: "#94a3b8",
        },
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
