import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { useAuth } from "../src/hooks/use-auth";

/**
 * Cold-start splash — routes to (auth) or (app) once bootstrap settles.
 * Same pattern as customer-mobile's app/index.tsx.
 */
export default function Index() {
  const { state } = useAuth();

  if (state.status === "bootstrapping") {
    return (
      <View className="flex-1 items-center justify-center bg-brand-primary">
        <Text className="text-3xl font-bold text-brand-accent">Event Fleet Sürücü</Text>
        <ActivityIndicator className="mt-8" color="#4ade80" />
      </View>
    );
  }

  if (state.status === "authenticated") {
    return <Redirect href="/(app)" />;
  }

  return <Redirect href="/(auth)/phone" />;
}
