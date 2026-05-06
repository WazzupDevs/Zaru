import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { statusDisplay } from "../../../src/components/BookingCard";
import { Button } from "../../../src/components/Button";
import { CancelBookingModal } from "../../../src/components/CancelBookingModal";
import { ErrorView } from "../../../src/components/ErrorView";
import { FullScreenLoading } from "../../../src/components/FullScreenLoading";
import { bookingApi } from "../../../src/lib/api";
import { ApiError, NetworkError } from "../../../src/lib/api/errors";
import { formatTrCurrency } from "../../../src/lib/format/currency";

import type { BookingResponse, BookingStatus } from "../../../src/lib/api/booking";

const CANCELLABLE_STATES: BookingStatus[] = ["CONFIRMED", "DRIVER_ASSIGNED"];

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const fetchBooking = useCallback(async () => {
    setLoadError(null);
    try {
      const fresh = await bookingApi.getById(id);
      setBooking(fresh);
    } catch (err) {
      if (err instanceof NetworkError) setLoadError("Bağlantı yok, tekrar deneyin");
      else if (err instanceof ApiError) setLoadError(err.message);
      else setLoadError("Rezervasyon yüklenemedi");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void fetchBooking();
    }, [fetchBooking]),
  );

  const handleCancelConfirm = useCallback(
    async (reason: string) => {
      const updated = await bookingApi.cancel(id, reason);
      setBooking(updated);
      setCancelOpen(false);
    },
    [id],
  );

  if (booking === null && loadError === null) {
    return <FullScreenLoading message="Rezervasyon yükleniyor..." />;
  }
  if (booking === null) {
    return (
      <ErrorView
        message={loadError ?? "Rezervasyon bulunamadı"}
        onRetry={() => {
          void fetchBooking();
        }}
      />
    );
  }

  const status = statusDisplay(booking.status);
  const cancellable = CANCELLABLE_STATES.includes(booking.status);

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <ScrollView contentContainerClassName="pb-12">
        <View className="gap-6 px-6 pt-4">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => {
                router.back();
              }}
            >
              <Text className="text-sm font-medium text-brand-muted">‹ Geri</Text>
            </Pressable>
            <View className={`rounded-full px-3 py-1 ${status.bg}`}>
              <Text className={`text-xs font-semibold ${status.tone}`}>{status.label}</Text>
            </View>
          </View>

          <View>
            <Text className="text-3xl font-bold text-brand-primary">Rezervasyon</Text>
            <Text className="mt-1 text-sm text-brand-muted">
              {new Date(booking.eventStartAt).toLocaleString("tr-TR", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>

          {/* Status-specific guidance */}
          <StatusGuidance status={booking.status} />

          <View className="gap-3 rounded-2xl bg-white p-4">
            <DetailRow label="Alış" value={booking.pickupAddress} />
            <DetailRow label="Bırakış" value={booking.dropoffAddress} />
            <DetailRow
              label="Etkinlik"
              value={formatRange(booking.eventStartAt, booking.eventEndAt)}
            />
          </View>

          <View className="flex-row items-center justify-between rounded-2xl bg-brand-primary px-5 py-5">
            <Text className="text-base font-medium text-white">Toplam</Text>
            <Text className="text-2xl font-bold text-brand-accent">
              {formatTrCurrency(booking.totalAmount)} ₺
            </Text>
          </View>

          {booking.cancellationReason !== null && (
            <View className="rounded-xl border border-red-200 bg-red-50 p-4">
              <Text className="text-xs uppercase tracking-wide text-red-700">İptal Sebebi</Text>
              <Text className="mt-1 text-sm text-red-800">{booking.cancellationReason}</Text>
            </View>
          )}

          {cancellable && (
            <Button
              label="Rezervasyonu İptal Et"
              variant="ghost"
              onPress={() => {
                setCancelOpen(true);
              }}
            />
          )}
        </View>
      </ScrollView>

      <CancelBookingModal
        visible={cancelOpen}
        onClose={() => {
          setCancelOpen(false);
        }}
        onConfirm={handleCancelConfirm}
      />
    </SafeAreaView>
  );
}

function StatusGuidance({ status }: { status: BookingStatus }) {
  const message = STATUS_GUIDANCE[status];
  if (!message) return null;
  return (
    <View className="rounded-xl border border-neutral-200 bg-white p-4">
      <Text className="text-sm text-brand-muted">{message}</Text>
    </View>
  );
}

const STATUS_GUIDANCE: Partial<Record<BookingStatus, string>> = {
  CONFIRMED: "Sürücü ataması yapılıyor. Kısa süre içinde size bildireceğiz.",
  DRIVER_ASSIGNED: "Sürücü atandı! Etkinlik gününe yakın iletişime geçeceğiz.",
  IN_PROGRESS: "Şu anda yoldasınız. Keyifli kullanımlar.",
  COMPLETED: "Hizmetiniz tamamlandı. Geri bildiriminizi bekliyoruz.",
  CANCELLED_BY_CUSTOMER: "Bu rezervasyon iptal edildi.",
  CANCELLED_BY_DRIVER: "Sürücü bu işi iptal etti. Tekrar fiyat alabilirsiniz.",
  EXPIRED: "Bu rezervasyonun süresi doldu.",
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs uppercase tracking-wide text-brand-muted">{label}</Text>
      <Text className="mt-1 text-sm text-brand-primary">{value}</Text>
    </View>
  );
}

function formatRange(startIso: string, endIso: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const start = new Date(startIso).toLocaleTimeString("tr-TR", opts);
  const end = new Date(endIso).toLocaleTimeString("tr-TR", opts);
  return `${start} – ${end}`;
}
