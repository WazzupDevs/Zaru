import { Tabs } from "expo-router";

import { Icons } from "../../src/components/Icon";

// Authenticated tab navigator. Three top-level tabs (Anasayfa /
// Rezervasyonlarım / Profil) + four hidden detail routes (vehicle/[id],
// quote, quote-summary, bookings/[id]) that the user navigates into via
// router.push from a tab screen. `href: null` removes them from the tab
// bar without removing them from the stack.
//
// Icons swapped from emoji placeholders to lucide-react-native vector
// glyphs in A4d-3. The brand SVG set (custom illustrations) lands in
// A4g alongside the real splash + app icon.
export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1a1a1a",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarStyle: { backgroundColor: "#ffffff", borderTopColor: "#e5e7eb" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Anasayfa",
          tabBarIcon: ({ color, size }) => <Icons.Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bookings/index"
        options={{
          title: "Rezervasyonlar",
          tabBarIcon: ({ color, size }) => <Icons.Calendar color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <Icons.User color={color} size={size} />,
        }}
      />

      {/* Detail routes — hidden from the tab bar. */}
      <Tabs.Screen name="vehicle/[id]" options={{ href: null }} />
      <Tabs.Screen name="quote" options={{ href: null }} />
      <Tabs.Screen name="quote-summary" options={{ href: null }} />
      <Tabs.Screen name="bookings/[id]" options={{ href: null }} />
    </Tabs>
  );
}
