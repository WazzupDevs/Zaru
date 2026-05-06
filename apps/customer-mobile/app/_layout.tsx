import { Slot } from "expo-router";

import "../global.css";

// Placeholder root layout — G2 fleshes this out with SafeAreaProvider,
// Expo Router stack groups for (auth) / (app), and the StatusBar config.
export default function RootLayout() {
  return <Slot />;
}
