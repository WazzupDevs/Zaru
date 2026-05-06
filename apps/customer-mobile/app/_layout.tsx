import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "../src/contexts/auth-context";

import "../global.css";

// Root layout — wraps every route in:
//   - GestureHandlerRootView: required by react-native-gesture-handler
//     (Expo Router uses it under the hood for stack transitions)
//   - SafeAreaProvider: lets nested screens read insets via useSafeAreaInsets
//   - AuthProvider: owns the auth state machine + bootstrap; (auth) and
//     (app) layouts read state via useAuth() to gate their stacks.
//   - Stack: top-level navigator. The actual auth/app routing decision
//     happens in app/index.tsx (cold-start splash) which redirects based
//     on AuthProvider state.
//
// `headerShown: false` — auth and app groups manage their own headers.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" backgroundColor="#1a1a1a" />
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
