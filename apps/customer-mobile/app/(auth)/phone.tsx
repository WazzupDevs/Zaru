import { router } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { useAuth } from "../../src/hooks/use-auth";
import { ApiError } from "../../src/lib/api/errors";
import { formatPartialAsYouType, isValidTrMobile, toE164 } from "../../src/lib/format/phone";

export default function PhoneScreen() {
  const { authApi } = useAuth();
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
      const res = await authApi.requestOtp({ phone: e164 });
      router.push({
        pathname: "/(auth)/verify",
        params: { phone: e164, requestId: res.requestId, expiresAt: res.expiresAt },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Bağlantı hatası, tekrar deneyin");
      }
    } finally {
      setSubmitting(false);
    }
  }, [authApi, raw, submitting]);

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 justify-between px-6 py-8">
          <View>
            <Text className="text-3xl font-bold text-brand-primary">Event Fleet</Text>
            <Text className="mt-2 text-base text-brand-muted">
              Düğün ve etkinlik araç hizmeti — telefon numaranızla giriş yapın.
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
