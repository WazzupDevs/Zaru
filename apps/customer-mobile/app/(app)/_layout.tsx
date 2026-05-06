import { Stack } from "expo-router";

// Authenticated stack — home + profile. G4 adds an auth-guard redirect
// at the layout level so an unauthenticated user landing here is bounced
// back to (auth)/phone.
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#fafafa" },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
