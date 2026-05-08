import { router } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { driverAuthApi } from "../../src/lib/api";
import { ApiError, NetworkError, WrongAppRoleError } from "../../src/lib/api/errors";
import { formatPartialAsYouType, isValidTrMobile, toE164 } from "../../src/lib/format/phone";

/**
 * Driver phone-entry. Same UX as customer phone screen with two
 * driver-spesifik bits:
 *   - DRIVER_NOT_INVITED → friendly TR copy directing the user to
 *     contact the admin (the whitelist gate is server-side; we just
 *     translate the error code)
 *   - WrongAppRoleError isn't possible from /auth/driver/otp/request
 *     (that endpoint just gates and queues), but the verify screen
 *     surfaces it.
 */
export default function PhoneScreen() {
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = isValidTrMobile(raw);

  const handleChange = useCallback((text: string) => {
    setError(null);
    setRaw(formatPartialAsYouType(text));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    const e164 = toE164(raw);
    if (e164 === null) {
      setError("Geçerli bir TR cep numarası girin (örn: 555 111 22 33)");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await driverAuthApi.requestOtp({ phone: e164 });
      router.push({
        pathname: "/(auth)/verify",
        params: { phone: e164, requestId: res.requestId, expiresAt: res.expiresAt },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "DRIVER_NOT_INVITED") {
          setError("Bu numara henüz davet listesinde değil. Operasyon ekibinizle iletişime geçin.");
        } else {
          setError(err.message);
        }
      } else if (err instanceof NetworkError) {
        setError("Bağlantı hatası, tekrar deneyin");
      } else if (err instanceof WrongAppRoleError) {
        setError(err.message);
      } else {
        setError("Beklenmeyen hata");
      }
    } finally {
      setSubmitting(false);
    }
  }, [raw, submitting]);

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 justify-between px-6 py-8">
          <View>
            <Text className="text-3xl font-bold text-brand-primary">Event Fleet Sürücü</Text>
            <Text className="mt-2 text-base text-brand-muted">
              Davet edildiğiniz telefon numarasıyla giriş yapın.
            </Text>

            <View className="mt-12">
              <Input
                label="Telefon Numarası"
                value={raw}
                onChangeText={handleChange}
                keyboardType="phone-pad"
                placeholder="555 111 22 33"
                maxLength={13}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  void handleSubmit();
                }}
                error={error}
                hint={!error ? "+90 ön ekini biz ekleyeceğiz" : undefined}
              />
            </View>
          </View>

          <Button
            label="Doğrulama Kodu Gönder"
            onPress={() => {
              void handleSubmit();
            }}
            loading={submitting}
            disabled={!valid}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
