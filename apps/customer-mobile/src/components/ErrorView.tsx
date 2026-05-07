import { Text, View } from "react-native";

import { Button } from "./Button";
import { Icons } from "./Icon";

export interface ErrorViewProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorView({ message, onRetry }: ErrorViewProps) {
  return (
    <View className="flex-1 items-center justify-center bg-brand-surface px-6">
      <Icons.Alert color="#dc2626" size={48} />
      <Text className="mt-4 mb-2 text-xl font-semibold text-brand-primary">Bir şey ters gitti</Text>
      <Text className="mb-8 text-center text-base text-brand-muted">{message}</Text>
      {onRetry && (
        <View className="w-full">
          <Button label="Tekrar Dene" variant="primary" onPress={onRetry} />
        </View>
      )}
    </View>
  );
}
