// Single preset — `babel-preset-expo` ships with the Expo Router transform
// and (via the `jsxImportSource` option) NativeWind v4's className→style
// pipeline. The legacy `nativewind/babel` plugin and `expo-router/babel`
// preset are intentionally absent: both were folded into babel-preset-expo
// in SDK 50+, and adding them again triggers duplicate-transform warnings.

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          jsxImportSource: "nativewind",
        },
      ],
    ],
  };
};
