import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function VerifyScreen() {
  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-brand-primary">Doğrulama Kodu</Text>
        <Text className="mt-2 text-base text-brand-muted">OTP girişi (G6)</Text>
      </View>
    </SafeAreaView>
  );
}
