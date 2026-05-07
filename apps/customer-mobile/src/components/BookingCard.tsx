import { Pressable, Text, View } from "react-native";

import { Icons, type IconName } from "./Icon";
import { formatTrCurrency } from "../lib/format/currency";

import type { BookingResponse, BookingStatus } from "../lib/api/booking";

interface StatusVisual {
  label: string;
  tone: string;
  bg: string;
  iconColor: string;
  icon: IconName;
}

const STATUS_LABELS: Record<BookingStatus, StatusVisual> = {
  DRAFT: {
    label: "Taslak",
    tone: "text-neutral-700",
    bg: "bg-neutral-100",
    iconColor: "#525252",
    icon: "Clock",
  },
  CONFIRMED: {
    label: "Onaylandı",
    tone: "text-blue-700",
    bg: "bg-blue-100",
    iconColor: "#1d4ed8",
    icon: "Check",
  },
  DRIVER_ASSIGNED: {
    label: "Sürücü Atandı",
    tone: "text-emerald-700",
    bg: "bg-emerald-100",
    iconColor: "#047857",
    icon: "Car",
  },
  IN_PROGRESS: {
    label: "Devam Ediyor",
    tone: "text-amber-700",
    bg: "bg-amber-100",
    iconColor: "#b45309",
    icon: "Clock",
  },
  COMPLETED: {
    label: "Tamamlandı",
    tone: "text-neutral-700",
    bg: "bg-neutral-100",
    iconColor: "#525252",
    icon: "Check",
  },
  CANCELLED_BY_CUSTOMER: {
    label: "İptal Ettiniz",
    tone: "text-red-700",
    bg: "bg-red-100",
    iconColor: "#b91c1c",
    icon: "XCircle",
  },
  CANCELLED_BY_DRIVER: {
    label: "Sürücü İptal Etti",
    tone: "text-red-700",
    bg: "bg-red-100",
    iconColor: "#b91c1c",
    icon: "XCircle",
  },
  EXPIRED: {
    label: "Süresi Doldu",
    tone: "text-neutral-700",
    bg: "bg-neutral-100",
    iconColor: "#525252",
    icon: "Clock",
  },
  DISPUTED: {
    label: "İhtilaflı",
    tone: "text-orange-700",
    bg: "bg-orange-100",
    iconColor: "#c2410c",
    icon: "Alert",
  },
};

export function statusDisplay(status: BookingStatus): StatusVisual {
  return STATUS_LABELS[status];
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatEventTimeRange(startIso: string, endIso: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const start = new Date(startIso).toLocaleTimeString("tr-TR", opts);
  const end = new Date(endIso).toLocaleTimeString("tr-TR", opts);
  return `${start} – ${end}`;
}

export interface BookingCardProps {
  booking: BookingResponse;
  onPress: () => void;
}

export function BookingCard({ booking, onPress }: BookingCardProps) {
  const status = statusDisplay(booking.status);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="rounded-2xl border border-neutral-200 bg-white p-4 active:opacity-70"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-medium text-brand-primary">
            {formatEventDate(booking.eventStartAt)}
          </Text>
          <Text className="mt-0.5 text-xs text-brand-muted">
            {formatEventTimeRange(booking.eventStartAt, booking.eventEndAt)}
          </Text>
        </View>
        <View className={`flex-row items-center gap-1.5 rounded-full px-3 py-1 ${status.bg}`}>
          {(() => {
            const StatusIcon = Icons[status.icon];
            return <StatusIcon size={12} color={status.iconColor} />;
          })()}
          <Text className={`text-xs font-semibold ${status.tone}`}>{status.label}</Text>
        </View>
      </View>

      <View className="mt-3 gap-1">
        <Text className="text-sm text-brand-primary" numberOfLines={1}>
          {booking.pickupAddress} → {booking.dropoffAddress}
        </Text>
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-xs text-brand-muted">Toplam</Text>
        <Text className="text-base font-semibold text-brand-primary">
          {formatTrCurrency(booking.totalAmount)} ₺
        </Text>
      </View>
    </Pressable>
  );
}
