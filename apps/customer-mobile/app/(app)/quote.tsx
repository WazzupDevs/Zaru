import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddonSelector } from "../../src/components/AddonSelector";
import { Button } from "../../src/components/Button";
import { DateTimePicker } from "../../src/components/DateTimePicker";
import { Input } from "../../src/components/Input";
import { useCategory } from "../../src/hooks/use-category";
import { pricingApi } from "../../src/lib/api";
import { ApiError, NetworkError } from "../../src/lib/api/errors";
import { type PricingRuleResponse } from "../../src/lib/api/pricing";
import {
  CATEGORY_SLUGS,
  DEFAULT_DROPOFF_COORDS,
  DEFAULT_PICKUP_COORDS,
} from "../../src/lib/constants";

function defaultEventStart(): Date {
  // 7 days from now at 14:00 — sensible default the user can edit.
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(14, 0, 0, 0);
  return d;
}

function defaultEventEnd(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(22, 0, 0, 0);
  return d;
}

const PRICING_ERROR_MESSAGES: Record<string, string> = {
  PRICING_RATE_LIMITED: "Çok fazla istek. Bir dakika bekleyip tekrar deneyin.",
  PRICING_INVALID_TIME_RANGE: "Etkinlik saatleri geçersiz. Bitiş başlangıçtan sonra olmalı.",
  PRICING_PROFILE_NOT_FOUND: "Bu araç tipi için fiyat tanımlı değil.",
  PRICING_DISTANCE_CALCULATION_FAILED: "Mesafe hesaplanamadı, tekrar deneyin.",
  PRICING_INVALID_ADDON_SELECTION: "Seçtiğiniz ek hizmetlerden biri geçersiz.",
  VALIDATION_ERROR: "Girdiğiniz bilgileri kontrol edin.",
};

export default function QuoteScreen() {
  const { vehicleTypeId } = useLocalSearchParams<{ vehicleTypeId: string }>();
  const { data: category } = useCategory(CATEGORY_SLUGS.WEDDING_CAR);

  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [eventStart, setEventStart] = useState<Date>(defaultEventStart);
  const [eventEnd, setEventEnd] = useState<Date>(defaultEventEnd);
  const [addons, setAddons] = useState<PricingRuleResponse[]>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load addon rules once we know category + vehicleTypeId.
  useEffect(() => {
    if (!category || vehicleTypeId.length === 0) return;
    let cancelled = false;
    pricingApi
      .listAddonRules({ categoryId: category.id, vehicleTypeId })
      .then((rules) => {
        if (!cancelled) setAddons(rules);
      })
      .catch(() => {
        // Addon load failure isn't fatal — user can still get a quote
        // without any addons selected. Silent fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [category, vehicleTypeId]);

  // The native picker hands back a real Date object so we don't need a
  // string parser any more — the only remaining client-side check is
  // "end after start" because the picker's minimumDate is set per-input,
  // not relative.
  const timeRangeValid = useMemo(() => eventEnd > eventStart, [eventStart, eventEnd]);

  const handleToggleAddon = useCallback((id: string) => {
    setSelectedAddonIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (!category || vehicleTypeId.length === 0) return;
    if (pickupAddress.trim().length === 0 || dropoffAddress.trim().length === 0) {
      setError("Alış ve bırakış adreslerini girin");
      return;
    }
    if (!timeRangeValid) {
      setError("Bitiş zamanı başlangıçtan sonra olmalı");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const quote = await pricingApi.requestQuote({
        vehicleTypeId,
        categoryId: category.id,
        pickupLat: DEFAULT_PICKUP_COORDS.lat,
        pickupLng: DEFAULT_PICKUP_COORDS.lng,
        pickupAddress: pickupAddress.trim(),
        dropoffLat: DEFAULT_DROPOFF_COORDS.lat,
        dropoffLng: DEFAULT_DROPOFF_COORDS.lng,
        dropoffAddress: dropoffAddress.trim(),
        eventStartAt: eventStart.toISOString(),
        eventEndAt: eventEnd.toISOString(),
        selectedAddonIds,
      });
      router.push({
        pathname: "/(app)/quote-summary",
        params: { quoteId: quote.id },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(PRICING_ERROR_MESSAGES[err.code ?? ""] ?? err.message);
      } else if (err instanceof NetworkError) {
        setError("Bağlantı hatası, tekrar deneyin");
      } else {
        setError("Beklenmeyen hata");
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    category,
    dropoffAddress,
    eventEnd,
    eventStart,
    pickupAddress,
    selectedAddonIds,
    submitting,
    timeRangeValid,
    vehicleTypeId,
  ]);

  // minimumDate guards: start can't be in the past; end can't be before start.
  const now = useMemo(() => new Date(), []);

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="pb-12">
          <View className="gap-6 px-6 pt-4">
            <View>
              <Text className="text-3xl font-bold text-brand-primary">Fiyat Al</Text>
              <Text className="mt-1 text-sm text-brand-muted">
                Aşağıdaki bilgileri girin, sabit fiyatınızı hesaplayalım.
              </Text>
            </View>

            <Input
              label="Alış noktası"
              value={pickupAddress}
              onChangeText={setPickupAddress}
              placeholder="Örn: Sultanahmet, İstanbul"
              autoCapitalize="words"
            />
            <Input
              label="Bırakış noktası"
              value={dropoffAddress}
              onChangeText={setDropoffAddress}
              placeholder="Örn: Beşiktaş, İstanbul"
              autoCapitalize="words"
            />

            <DateTimePicker
              label="Etkinlik başlangıcı"
              value={eventStart}
              onChange={setEventStart}
              minimumDate={now}
            />
            <DateTimePicker
              label="Etkinlik bitişi"
              value={eventEnd}
              onChange={setEventEnd}
              minimumDate={eventStart}
            />

            <AddonSelector
              addons={addons}
              selectedIds={selectedAddonIds}
              onToggle={handleToggleAddon}
              disabled={submitting}
            />

            {error !== null && (
              <Text className="text-center text-sm text-brand-danger">{error}</Text>
            )}

            <Button
              label="Fiyat Hesapla"
              onPress={() => {
                void handleSubmit();
              }}
              loading={submitting}
              disabled={!category}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
