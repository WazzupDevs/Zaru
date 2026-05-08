export const PUSH_SENDER_PORT = Symbol("PUSH_SENDER_PORT");

export interface PushSendInput {
  /** Expo push token (`ExponentPushToken[...]`). Provider gets this clear. */
  expoPushToken: string;
  /** Notification heading shown in the OS tray. Localized. */
  title: string;
  /** Body text. Templates render this via TemplateRenderer.render(channel="push"). */
  body: string;
  /**
   * Optional opaque payload — the mobile foreground handler reads this
   * to deep-link into a screen. Kept generic (string→string) so we
   * don't bake routing knowledge into the sender.
   */
  data?: Record<string, string>;
  /** Notification id (or correlation id) for adapter logging. */
  sourceId?: string;
}

export interface PushSendResult {
  /** Provider id — Expo returns one per ticket; format: `<receipt-id>`. */
  providerMessageId: string;
  sentAt: Date;
}

/**
 * Push provider abstraction (ADR 0021 amended in A4e-3). Two adapters:
 *
 *   MockPushSender — dev/test, in-memory inbox + masked debug log. Used
 *     when EXPO_PUSH_PROJECT_ID is unset OR starts with `DUMMY_`. Lets
 *     the integration suite assert delivery without an external service
 *     + lets the smoke script run without a real Expo project.
 *
 *   ExpoPushSender — prod, calls Expo's HTTP push gateway via
 *     `expo-server-sdk`. Selected when EXPO_PUSH_PROJECT_ID is a real
 *     UUID. Activated end-to-end in A4g (production deploy).
 *
 * Selection happens in the factory in notifications.module.ts. The
 * shape mirrors SmsSenderPort intentionally so SendNotificationUseCase
 * can branch on `notification.channel` without learning provider-
 * specific call shapes.
 */
export interface PushSenderPort {
  send(input: PushSendInput): Promise<PushSendResult>;
}
