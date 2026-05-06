import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BookingCard } from "../../../src/components/BookingCard";
import { ErrorView } from "../../../src/components/ErrorView";
import { FullScreenLoading } from "../../../src/components/FullScreenLoading";
import { bookingApi } from "../../../src/lib/api";
import { ApiError, NetworkError } from "../../../src/lib/api/errors";

import type { BookingResponse } from "../../../src/lib/api/booking";

export default function BookingsListScreen() {
  const [bookings, setBookings] = useState<BookingResponse[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    try {
      const list = await bookingApi.listMy({ limit: 50 });
      setBookings(list);
    } catch (err) {
      if (err instanceof NetworkError) setError("Bağlantı yok, tekrar deneyin");
      else if (err instanceof ApiError) setError(err.message);
      else setError("Rezervasyonlar yüklenemedi");
    } finally {
      if (mode === "refresh") setRefreshing(false);
    }
  }, []);

  // Refresh on every focus — when the user comes back from booking detail
  // (e.g., after a cancel) the list reflects the new state without manual
  // pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      void fetchBookings(bookings === null ? "initial" : "refresh");
    }, [bookings, fetchBookings]),
  );

  if (bookings === null && error === null) {
    return <FullScreenLoading message="Rezervasyonlar yükleniyor..." />;
  }

  if (bookings === null && error !== null) {
    return (
      <ErrorView
        message={error}
        onRetry={() => {
          void fetchBookings("initial");
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <View className="px-6 pt-4">
        <Text className="text-3xl font-bold text-brand-primary">Rezervasyonlarım</Text>
      </View>
      <FlatList
        data={bookings ?? []}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-6 pt-4 pb-12"
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            onPress={() => {
              router.push({ pathname: "/(app)/bookings/[id]", params: { id: item.id } });
            }}
          />
        )}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Text className="text-center text-base text-brand-muted">
              Henüz rezervasyon yok. Anasayfadan başlayın.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void fetchBookings("refresh");
            }}
          />
        }
      />
    </SafeAreaView>
  );
}
