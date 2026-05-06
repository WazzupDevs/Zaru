import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../../src/components/Button";
import { ErrorView } from "../../../src/components/ErrorView";
import { FullScreenLoading } from "../../../src/components/FullScreenLoading";
import { useCategory } from "../../../src/hooks/use-category";
import { CATEGORY_SLUGS } from "../../../src/lib/constants";

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, refetch } = useCategory(CATEGORY_SLUGS.WEDDING_CAR);

  if (loading) return <FullScreenLoading />;
  if (error || !data) {
    return (
      <ErrorView
        message={error ?? "Veri yok"}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const vehicleType = data.vehicleTypes.find((vt) => vt.id === id);
  if (!vehicleType) {
    return (
      <ErrorView
        message="Araç tipi bulunamadı"
        onRetry={() => {
          router.back();
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <ScrollView contentContainerClassName="pb-12">
        <View className="px-6 pt-4">
          <Text className="text-3xl font-bold text-brand-primary">{vehicleType.name}</Text>
          {vehicleType.description !== null && (
            <Text className="mt-2 text-base text-brand-muted">{vehicleType.description}</Text>
          )}

          {/* Image placeholder. */}
          <View className="mt-6 h-56 items-center justify-center rounded-2xl bg-neutral-100">
            <Text className="text-sm text-neutral-400">Görsel yakında</Text>
          </View>

          <View className="mt-6 gap-3 rounded-2xl bg-white p-4">
            <DetailRow label="Kapasite">
              {vehicleType.capacityMin === vehicleType.capacityMax
                ? `${String(vehicleType.capacityMax)} kişilik`
                : `${String(vehicleType.capacityMin)}–${String(vehicleType.capacityMax)} kişilik`}
            </DetailRow>
          </View>
        </View>
      </ScrollView>

      <View className="border-t border-neutral-200 bg-white px-6 py-4">
        <Button
          label="Fiyat Al"
          onPress={() => {
            router.push(`/(app)/quote?vehicleTypeId=${vehicleType.id}`);
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function DetailRow({ label, children }: { label: string; children: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-brand-muted">{label}</Text>
      <Text className="text-base font-medium text-brand-primary">{children}</Text>
    </View>
  );
}
