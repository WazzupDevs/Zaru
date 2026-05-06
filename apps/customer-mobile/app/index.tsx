import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { useAuth } from "../src/hooks/use-auth";

// Cold-start root. While bootstrap is in flight we show a brand-themed
// splash; once auth state settles we redirect into the right group. We
// don't gate inside (auth)/_layout or (app)/_layout because Expo Router
// reads the route tree before AuthProvider hydrates and would race.
export default function Index() {
  const { state } = useAuth();

  if (state.status === "bootstrapping") {
    return (
      <View className="flex-1 items-center justify-center bg-brand-primary">
        <Text className="text-3xl font-bold text-brand-accent">Event Fleet</Text>
        <ActivityIndicator className="mt-8" color="#d4af37" />
      </View>
    );
  }

  if (state.status === "authenticated") {
    return <Redirect href="/(app)" />;
  }

  return <Redirect href="/(auth)/phone" />;
}
