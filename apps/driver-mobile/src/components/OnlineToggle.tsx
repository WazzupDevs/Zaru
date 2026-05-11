import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

export interface OnlineToggleProps {
  isOnline: boolean;
  /**
   * Called when the user taps. The home screen handles the
   * permission-flow + initial-location-update side effects; this
   * component just signals intent + reflects the current state.
   */
  onToggle: () => Promise<void>;
  disabled?: boolean;
}

/**
 * Big, hard-to-miss status block. The colour change (`brand-online`
 * green ↔ `brand-offline` slate) is the primary affordance — drivers
 * glance at it from across a vehicle, copy is secondary. The state
 * pill at the bottom doubles as a screen-reader hook.
 */
export function OnlineToggle({ isOnline, onToggle, disabled }: OnlineToggleProps) {
  const [updating, setUpdating] = useState(false);

  const handlePress = async () => {
    if (disabled === true || updating) return;
    setUpdating(true);
    try {
      await onToggle();
    } finally {
      setUpdating(false);
    }
  };

  const isDisabled = disabled === true || updating;

  return (
    <Pressable
      onPress={() => {
        void handlePress();
      }}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: updating, selected: isOnline }}
      className={`min-h-[160px] items-center justify-center rounded-3xl p-8 ${
        isOnline ? "bg-brand-online" : "bg-brand-offline"
      } ${isDisabled ? "opacity-60" : ""}`}
    >
      {updating ? (
        <ActivityIndicator color="white" size="large" />
      ) : (
        <>
          <Text className="mb-2 text-3xl font-bold text-white">
            {isOnline ? "Çalışıyorum" : "Kapalı"}
          </Text>
          <Text className="text-center text-sm text-white opacity-80">
            {isOnline ? "İş teklifleri sana ulaşacak" : "İş almak için aç"}
          </Text>
          <View className="mt-4 rounded-full bg-white/20 px-4 py-2">
            <Text className="font-medium text-white">{isOnline ? "🟢 AÇIK" : "⚪ KAPALI"}</Text>
          </View>
        </>
      )}
    </Pressable>
  );
}
