// NativeWind v4 reads PostCSS config to compile global.css's @tailwind
// directives during Metro bundling. autoprefixer is web-only — RN
// strips it — but tailwindcss is required.
module.exports = {
  plugins: {
    tailwindcss: {},
  },
};
