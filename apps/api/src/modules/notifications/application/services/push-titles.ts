import type { NotificationKind } from "../../domain/notification-types";

/**
 * Notification kind → push notification title (Turkish, OS tray heading).
 * Body comes from the existing SMS template (rendered identically),
 * title is per-kind here. Keeps templates uniform across channels (no
 * `.push.json` split format) at the cost of one mapping table.
 *
 * Future locales add their own table + a locale parameter to titleFor.
 */
const TITLES_TR: Record<NotificationKind, string> = {
  BOOKING_CONFIRMED: "Rezervasyon Onaylandı",
  BOOKING_CANCELLED: "Rezervasyon İptal Edildi",
  BOOKING_EXPIRED: "Rezervasyon Süresi Doldu",
  DRIVER_ASSIGNED_TO_BOOKING: "Sürücünüz Atandı",
  NEW_BOOKING_OFFER: "Yeni Rezervasyon",
  BOOKING_CANCELLED_DRIVER: "Rezervasyon İptal Edildi",
  OTP_REQUEST: "Doğrulama Kodu",
};

export function pushTitleFor(kind: NotificationKind): string {
  return TITLES_TR[kind];
}
