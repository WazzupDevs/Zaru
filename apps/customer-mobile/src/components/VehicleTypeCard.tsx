import { Pressable, Text, View } from "react-native";

import type { VehicleType } from "../lib/api/catalog";

export interface VehicleTypeCardProps {
  vehicleType: VehicleType;
  onPress: () => void;
}

export function VehicleTypeCard({ vehicleType, onPress }: VehicleTypeCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="overflow-hidden rounded-2xl border border-neutral-200 bg-white active:opacity-70"
    >
      {/* Image placeholder — A4d-3 polish swaps in real photography. */}
      <View className="h-40 items-center justify-center bg-neutral-100">
        <Text className="text-sm text-neutral-400">{vehicleType.name}</Text>
      </View>
      <View className="p-4">
        <Text className="text-lg font-semibold text-brand-primary">{vehicleType.name}</Text>
        {vehicleType.description !== null && (
          <Text className="mt-1 text-sm text-brand-muted" numberOfLines={2}>
            {vehicleType.description}
          </Text>
        )}
        <Text className="mt-2 text-xs text-brand-muted">
          {vehicleType.capacityMin === vehicleType.capacityMax
            ? `${String(vehicleType.capacityMax)} kişilik`
            : `${String(vehicleType.capacityMin)}–${String(vehicleType.capacityMax)} kişilik`}
        </Text>
      </View>
    </Pressable>
  );
}
