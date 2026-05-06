import { Text, View } from "react-native";

// G1 placeholder — replaced in G2 with redirect logic that sends to
// (auth)/phone or (app) based on AuthContext bootstrap result.
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-neutral-950">
      <Text className="text-amber-400 text-lg">Event Fleet</Text>
    </View>
  );
}
