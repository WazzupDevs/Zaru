import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "../src/contexts/auth-context";

import "../global.css";

/**
 * Root layout — same wrapping as customer-mobile (gesture handler +
 * safe area + AuthProvider) so the two apps stay shape-symmetrical.
 *
 * Push foreground handler config lands in A4f-1b (uses A4e-3's
 * PushTokenService once expo-notifications is added to the dep set).
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" backgroundColor="#0a0a0a" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
