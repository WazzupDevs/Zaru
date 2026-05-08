import { Text, View } from "react-native";

import { Button } from "./Button";

export interface ErrorViewProps {
  message: string;
  onRetry?: () => void;
}

/**
 * Driver app's ErrorView — text-only for A4f-1a; lucide-react-native +
 * an Alert glyph land in A4f-3 polish (matching customer-mobile pattern).
 */
export function ErrorView({ message, onRetry }: ErrorViewProps) {
  return (
    <View className="flex-1 items-center justify-center bg-brand-surface px-6">
      <Text className="mb-2 text-xl font-semibold text-brand-primary">Bir şey ters gitti</Text>
      <Text className="mb-8 text-center text-base text-brand-muted">{message}</Text>
      {onRetry && (
        <View className="w-full">
          <Button label="Tekrar Dene" variant="primary" onPress={onRetry} />
        </View>
      )}
    </View>
  );
}
