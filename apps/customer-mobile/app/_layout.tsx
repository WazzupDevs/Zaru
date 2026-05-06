import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import "../global.css";

// Root layout — wraps every route in:
//   - GestureHandlerRootView: required by react-native-gesture-handler
//     (Expo Router uses it under the hood for stack transitions)
//   - SafeAreaProvider: lets nested screens read insets via useSafeAreaInsets
//   - Stack: top-level navigator that routes between the (auth) and (app)
//     groups based on AuthContext state (G4 wires the redirect logic;
//     here both groups are just declared).
//
// `headerShown: false` — auth and app groups manage their own headers.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#1a1a1a" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
