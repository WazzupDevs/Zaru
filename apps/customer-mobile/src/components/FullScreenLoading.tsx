import { ActivityIndicator, Text, View } from "react-native";

export interface FullScreenLoadingProps {
  message?: string;
}

export function FullScreenLoading({ message }: FullScreenLoadingProps) {
  return (
    <View className="flex-1 items-center justify-center bg-brand-primary">
      <Text className="mb-8 text-3xl font-bold text-brand-accent">Event Fleet</Text>
      <ActivityIndicator color="#d4af37" />
      {message !== undefined && <Text className="mt-4 text-sm text-neutral-300">{message}</Text>}
    </View>
  );
}
