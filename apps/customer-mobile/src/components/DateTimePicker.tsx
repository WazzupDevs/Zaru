import RNDateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";

import { Button } from "./Button";

export interface DateTimePickerProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  error?: string | null | undefined;
}

/**
 * Platform-specific date+time picker.
 *
 *   Android: tapping the trigger opens the system picker (modal). The
 *     picker's onChange fires once with type === "set" (user picked) or
 *     "dismissed" (cancel) — we close it either way and only commit on
 *     "set". For datetime, Android shows a date picker first, then a
 *     time picker on the second tap; we run the picker in "datetime"
 *     mode which the package internally chains.
 *
 *   iOS: there is no system "picker modal" — the picker is a wheel that
 *     lives inline in your view. We wrap it in a slide-up Modal with an
 *     explicit "Tamam" confirm button so the user can adjust the wheel
 *     freely and only commit when they decide. The `tempDate` ref lets
 *     them roll the wheel without firing onChange on the parent every
 *     tick.
 */
export function DateTimePicker({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  error,
}: DateTimePickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date | null>(null);

  const hasError = typeof error === "string" && error.length > 0;

  const formatDisplay = (d: Date | null): string => {
    if (!d) return "Tarih ve saat seçin";
    return d.toLocaleString("tr-TR", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleAndroidChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowPicker(false);
    if (event.type === "set" && selectedDate) {
      onChange(selectedDate);
    }
  };

  const handleIosWheelChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) setTempDate(selectedDate);
  };

  const confirmIos = () => {
    if (tempDate) onChange(tempDate);
    setShowPicker(false);
    setTempDate(null);
  };

  const cancelIos = () => {
    setShowPicker(false);
    setTempDate(null);
  };

  return (
    <View className="w-full">
      <Text className="mb-2 text-sm font-medium text-brand-primary">{label}</Text>
      <Pressable
        onPress={() => {
          setTempDate(value ?? new Date());
          setShowPicker(true);
        }}
        accessibilityRole="button"
        className={`h-14 justify-center rounded-xl border px-4 ${
          hasError ? "border-brand-danger bg-red-50" : "border-neutral-300 bg-white"
        }`}
      >
        <Text className={`text-base ${value ? "text-brand-primary" : "text-neutral-400"}`}>
          {formatDisplay(value)}
        </Text>
      </Pressable>
      {hasError && <Text className="mt-1 text-sm text-brand-danger">{error}</Text>}

      {Platform.OS === "android" && showPicker && (
        <RNDateTimePicker
          value={value ?? new Date()}
          mode="datetime"
          onChange={handleAndroidChange}
          {...(minimumDate ? { minimumDate } : {})}
          {...(maximumDate ? { maximumDate } : {})}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal visible={showPicker} transparent animationType="slide" onRequestClose={cancelIos}>
          <Pressable className="flex-1 justify-end bg-black/50" onPress={cancelIos}>
            <Pressable
              className="rounded-t-3xl bg-white p-6"
              onPress={(e) => {
                e.stopPropagation();
              }}
            >
              <View className="mb-4 h-1 w-12 self-center rounded-full bg-neutral-300" />
              <RNDateTimePicker
                value={tempDate ?? value ?? new Date()}
                mode="datetime"
                display="inline"
                onChange={handleIosWheelChange}
                {...(minimumDate ? { minimumDate } : {})}
                {...(maximumDate ? { maximumDate } : {})}
                themeVariant="light"
              />
              <Button
                label="Tamam"
                variant="primary"
                onPress={confirmIos}
                style={{ marginTop: 16 }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
