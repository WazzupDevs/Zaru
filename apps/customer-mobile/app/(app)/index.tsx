import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorView } from "../../src/components/ErrorView";
import { FullScreenLoading } from "../../src/components/FullScreenLoading";
import { VehicleTypeCard } from "../../src/components/VehicleTypeCard";
import { useAuth } from "../../src/hooks/use-auth";
import { useCategory } from "../../src/hooks/use-category";
import { CATEGORY_SLUGS } from "../../src/lib/constants";

export default function HomeScreen() {
  const { state } = useAuth();
  const { data, loading, error, refetch } = useCategory(CATEGORY_SLUGS.WEDDING_CAR);

  if (loading) return <FullScreenLoading message="Araçlar yükleniyor..." />;
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

  if (state.status !== "authenticated") return null;

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <ScrollView contentContainerClassName="pb-12">
        <View className="px-6 pt-4">
          <Text className="text-3xl font-bold text-brand-primary">{data.name}</Text>
          {data.description !== null && (
            <Text className="mt-2 text-base text-brand-muted">{data.description}</Text>
          )}
          {!state.verified && (
            <View className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
              <Text className="text-xs text-amber-700">
                Bağlantı bekleniyor — gösterilen bilgiler önbellekten.
              </Text>
            </View>
          )}
        </View>

        <View className="mt-6 gap-4 px-6">
          {data.vehicleTypes.length === 0 ? (
            <Text className="text-center text-base text-brand-muted">
              Şu anda uygun araç tipi yok.
            </Text>
          ) : (
            data.vehicleTypes.map((vt) => (
              <VehicleTypeCard
                key={vt.id}
                vehicleType={vt}
                onPress={() => {
                  router.push(`/(app)/vehicle/${vt.id}`);
                }}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
