import { Stack } from "expo-router";

// Auth flow stack — phone → verify. Headers off so each screen renders
// its own brand-styled top section.
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#fafafa" },
      }}
    >
      <Stack.Screen name="phone" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
