import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileScreen() {
  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-brand-primary">Profil</Text>
        <Text className="mt-2 text-base text-brand-muted">Profil görünümü (G6)</Text>
      </View>
    </SafeAreaView>
  );
}
