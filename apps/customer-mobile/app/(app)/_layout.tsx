import { Tabs } from "expo-router";
import { Text } from "react-native";

// Authenticated tab navigator. Three top-level tabs (Anasayfa /
// Rezervasyonlarım / Profil) + four hidden detail routes (vehicle/[id],
// quote, quote-summary, bookings/[id]) that the user navigates into via
// router.push from a tab screen. `href: null` removes them from the tab
// bar without removing them from the stack.
//
// Icons are text emojis for A4d-2; A4d-3 polish swaps in lucide-react-
// native vector icons (deferred to keep the dep tree small this session).
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
          tabBarIcon: ({ color }) => <TabIcon emoji="🏠" color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings/index"
        options={{
          title: "Rezervasyonlar",
          tabBarIcon: ({ color }) => <TabIcon emoji="📅" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} />,
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

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 22, color }}>{emoji}</Text>;
}
