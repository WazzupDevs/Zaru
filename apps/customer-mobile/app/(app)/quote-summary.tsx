import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/Button";
import { ErrorView } from "../../src/components/ErrorView";
import { FullScreenLoading } from "../../src/components/FullScreenLoading";
import { bookingApi, pricingApi } from "../../src/lib/api";
import { ApiError, NetworkError } from "../../src/lib/api/errors";
import { type PriceQuoteResponse } from "../../src/lib/api/pricing";
import { formatTrCurrency } from "../../src/lib/format/currency";

const CONFIRM_ERROR_MESSAGES: Record<string, string> = {
  PRICING_QUOTE_EXPIRED: "Fiyat süresi doldu. Geri dönüp yeni fiyat alın.",
  PRICING_QUOTE_ALREADY_CONSUMED: "Bu fiyat zaten kullanılmış.",
  PRICING_QUOTE_NOT_FOUND: "Fiyat bulunamadı.",
  BOOKING_ACCESS_DENIED: "Bu fiyat sizin değil.",
  VALIDATION_ERROR: "İstek geçersiz, tekrar deneyin.",
};

export default function QuoteSummaryScreen() {
  const { quoteId } = useLocalSearchParams<{ quoteId: string }>();
  const [quote, setQuote] = useState<PriceQuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    if (quoteId.length === 0) return;
    let cancelled = false;
    pricingApi
      .getQuote(quoteId)
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof NetworkError) setLoadError("Bağlantı hatası, tekrar deneyin");
        else if (err instanceof ApiError) setLoadError(err.message);
        else setLoadError("Fiyat yüklenemedi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  const handleConfirm = useCallback(async () => {
    if (!quote || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const booking = await bookingApi.confirm(quote.id);
      router.replace({ pathname: "/(app)/bookings/[id]", params: { id: booking.id } });
    } catch (err) {
      if (err instanceof ApiError) {
        setConfirmError(CONFIRM_ERROR_MESSAGES[err.code ?? ""] ?? err.message);
      } else if (err instanceof NetworkError) {
        setConfirmError("Bağlantı hatası, tekrar deneyin");
      } else {
        setConfirmError("Onaylanamadı");
      }
    } finally {
      setConfirming(false);
    }
  }, [confirming, quote]);

  if (loading) return <FullScreenLoading message="Fiyat yükleniyor..." />;
  if (loadError !== null || !quote) {
    return (
      <ErrorView
        message={loadError ?? "Fiyat bulunamadı"}
        onRetry={() => {
          router.back();
        }}
      />
    );
  }

  const expiresInMinutes = Math.max(
    0,
    Math.floor((new Date(quote.expiresAt).getTime() - Date.now()) / 60000),
  );

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <ScrollView contentContainerClassName="pb-12">
        <View className="gap-6 px-6 pt-4">
          <View>
            <Text className="text-3xl font-bold text-brand-primary">Fiyat Özeti</Text>
            <Text className="mt-1 text-sm text-brand-muted">
              Fiyat {String(expiresInMinutes)} dakika daha geçerli.
            </Text>
          </View>

          <View className="gap-3 rounded-2xl bg-white p-5">
            <BreakdownRow
              label="Sabit ücret"
              value={`${formatTrCurrency(quote.breakdown.baseFee.amount)} ₺`}
            />
            <BreakdownRow
              label="Mesafe"
              value={`${formatTrCurrency(quote.breakdown.distanceFee.amount)} ₺`}
              hint={`${quote.distanceKm} km`}
            />
            <BreakdownRow
              label="Saatlik"
              value={`${formatTrCurrency(quote.breakdown.hourlyFee.amount)} ₺`}
              hint={`${quote.durationHours} saat`}
            />
            <View className="border-t border-neutral-200 pt-3">
              <BreakdownRow
                label="Ara toplam"
                value={`${formatTrCurrency(quote.breakdown.subtotal.amount)} ₺`}
                bold
              />
            </View>

            {quote.breakdown.multipliers.length > 0 && (
              <View className="gap-2 border-t border-neutral-200 pt-3">
                {quote.breakdown.multipliers.map((m) => (
                  <BreakdownRow key={m.ruleId} label={m.name} value={`× ${m.multiplier}`} muted />
                ))}
              </View>
            )}

            {quote.breakdown.addons.length > 0 && (
              <View className="gap-2 border-t border-neutral-200 pt-3">
                <Text className="text-xs uppercase tracking-wide text-brand-muted">
                  Ek hizmetler
                </Text>
                {quote.breakdown.addons.map((a) => (
                  <BreakdownRow
                    key={a.ruleId}
                    label={a.name}
                    value={`${formatTrCurrency(a.amount.amount)} ₺`}
                  />
                ))}
              </View>
            )}
          </View>

          <View className="flex-row items-center justify-between rounded-2xl bg-brand-primary px-5 py-6">
            <Text className="text-base font-medium text-white">Toplam</Text>
            <Text className="text-3xl font-bold text-brand-accent">
              {formatTrCurrency(quote.totalAmount)} ₺
            </Text>
          </View>

          <View className="gap-2 rounded-2xl bg-white p-4">
            <DetailRow label="Alış" value={quote.pickupAddress} />
            <DetailRow label="Bırakış" value={quote.dropoffAddress} />
          </View>

          {confirmError !== null && (
            <Text className="text-center text-sm text-brand-danger">{confirmError}</Text>
          )}

          <Button
            label="Onayla ve Rezerve Et"
            onPress={() => {
              void handleConfirm();
            }}
            loading={confirming}
            disabled={expiresInMinutes <= 0}
          />

          <Pressable
            onPress={() => {
              router.back();
            }}
          >
            <Text className="text-center text-sm font-medium text-brand-muted">Geri Dön</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface BreakdownRowProps {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  hint?: string;
}

function BreakdownRow({ label, value, bold = false, muted = false, hint }: BreakdownRowProps) {
  const labelClass = `${bold ? "font-semibold" : ""} ${muted ? "text-brand-muted" : "text-brand-primary"}`;
  const valueClass = `${bold ? "font-semibold" : ""} ${muted ? "text-brand-muted" : "text-brand-primary"}`;
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-1">
        <Text className={labelClass}>{label}</Text>
        {hint !== undefined && <Text className="text-xs text-brand-muted">{hint}</Text>}
      </View>
      <Text className={valueClass}>{value}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs uppercase tracking-wide text-brand-muted">{label}</Text>
      <Text className="mt-1 text-sm text-brand-primary">{value}</Text>
    </View>
  );
}
