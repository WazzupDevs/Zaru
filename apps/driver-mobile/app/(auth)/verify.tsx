import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/Button";
import { OtpInput } from "../../src/components/OtpInput";
import { useAuth } from "../../src/hooks/use-auth";
import { driverAuthApi } from "../../src/lib/api";
import { ApiError, NetworkError, WrongAppRoleError } from "../../src/lib/api/errors";
import { formatTrMobileForDisplay } from "../../src/lib/format/phone";

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Driver OTP verify. Mirrors the customer verify screen except for
 * one branch: a successful verify response goes through Zod with a
 * literal "DRIVER" role check, so a customer trying to log in here
 * surfaces as WrongAppRoleError + a friendly TR copy + redirect home.
 */
export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone?: string; requestId?: string }>();
  const phone = params.phone ?? "";
  const requestId = params.requestId ?? "";

  const { login } = useAuth();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRequestId, setCurrentRequestId] = useState(requestId);
  const [cooldownLeft, setCooldownLeft] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setInterval(() => {
      setCooldownLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      clearInterval(t);
    };
  }, [cooldownLeft]);

  const handleVerify = useCallback(
    async (override?: string) => {
      const value = override ?? code;
      if (value.length !== 6 || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const tokens = await driverAuthApi.verifyOtp({
          phone,
          requestId: currentRequestId,
          code: value,
        });
        await login(
          {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            accessTokenExpiresAt: tokens.accessTokenExpiresAt,
            refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
          },
          tokens.user,
        );
        router.replace("/(app)");
      } catch (err) {
        setCode("");
        if (err instanceof WrongAppRoleError) {
          setError(err.message);
        } else if (err instanceof ApiError) {
          setError(err.message);
        } else if (err instanceof NetworkError) {
          setError("Bağlantı hatası, tekrar deneyin");
        } else {
          setError("Beklenmeyen hata");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [code, currentRequestId, login, phone, submitting],
  );

  const handleChange = useCallback(
    (next: string) => {
      setError(null);
      setCode(next);
      if (next.length === 6) {
        void handleVerify(next);
      }
    },
    [handleVerify],
  );

  const handleResend = useCallback(async () => {
    if (resending || cooldownLeft > 0) return;
    setResending(true);
    setError(null);
    try {
      const res = await driverAuthApi.requestOtp({ phone });
      setCurrentRequestId(res.requestId);
      setCooldownLeft(RESEND_COOLDOWN_SECONDS);
      setCode("");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Bağlantı hatası, tekrar deneyin");
      }
    } finally {
      setResending(false);
    }
  }, [cooldownLeft, phone, resending]);

  if (phone === "" || requestId === "") {
    router.replace("/(auth)/phone");
    return null;
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 justify-between px-6 py-8">
          <View>
            <Text className="text-3xl font-bold text-brand-primary">Doğrulama Kodu</Text>
            <Text className="mt-2 text-base text-brand-muted">
              {formatTrMobileForDisplay(phone)} numarasına 6 haneli kod gönderdik.
            </Text>

            <View className="mt-12">
              <OtpInput
                value={code}
                onChange={handleChange}
                error={error !== null}
                disabled={submitting}
              />
              {error !== null && <Text className="mt-3 text-sm text-brand-danger">{error}</Text>}
            </View>

            <View className="mt-8 flex-row items-center justify-center">
              {cooldownLeft > 0 ? (
                <Text className="text-sm text-brand-muted">Tekrar gönder ({cooldownLeft}s)</Text>
              ) : (
                <Pressable
                  onPress={() => {
                    void handleResend();
                  }}
                  disabled={resending}
                >
                  <Text className="text-sm font-semibold text-brand-primary">
                    {resending ? "Gönderiliyor..." : "Kodu tekrar gönder"}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <Button
            label="Doğrula"
            onPress={() => {
              void handleVerify();
            }}
            loading={submitting}
            disabled={code.length !== 6}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
