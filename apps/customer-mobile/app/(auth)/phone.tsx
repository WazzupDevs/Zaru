import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// G6 wires the real phone-entry form. G2 ships only the brand-themed
// placeholder so the route group typechecks and the brand palette is
// visible end-to-end before any UI logic lands.
export default function PhoneScreen() {
  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-3xl font-bold text-brand-primary">Event Fleet</Text>
        <Text className="mt-2 text-base text-brand-muted">Telefon girişi (G6)</Text>
      </View>
    </SafeAreaView>
  );
}
