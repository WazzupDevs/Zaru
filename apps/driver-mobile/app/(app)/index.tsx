import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/Button";
import { useAuth } from "../../src/hooks/use-auth";
import { formatTrMobileForDisplay } from "../../src/lib/format/phone";

/**
 * Placeholder home — A4f-1b lands the online toggle + location update +
 * push registration here. For A4f-1a we just confirm the auth round-trip
 * works (welcome banner + logout button).
 */
export default function HomeScreen() {
  const { state, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }, [logout]);

  if (state.status !== "authenticated") return null;

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <ScrollView contentContainerClassName="pb-12">
        <View className="gap-8 px-6 pt-4">
          <View>
            <Text className="text-3xl font-bold text-brand-primary">
              Hoş geldiniz{state.user.displayName !== null ? `, ${state.user.displayName}` : ""}
            </Text>
            <Text className="mt-1 text-sm text-brand-muted">
              {formatTrMobileForDisplay(state.user.phoneE164)}
            </Text>
            {!state.verified && (
              <View className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
                <Text className="text-xs text-amber-700">
                  Bağlantı bekleniyor — gösterilen bilgiler önbellekten.
                </Text>
              </View>
            )}
          </View>

          <View className="rounded-2xl border border-neutral-200 bg-white p-5">
            <Text className="text-sm text-brand-muted">Çalışma Durumu</Text>
            <Text className="mt-1 text-2xl font-bold text-brand-primary">Çevrimdışı</Text>
            <Text className="mt-2 text-xs text-brand-muted">
              A4f-1b'de açma/kapatma + konum güncelleme buraya gelecek.
            </Text>
          </View>

          <View className="rounded-2xl border border-neutral-200 bg-white p-5">
            <Text className="text-sm text-brand-muted">Bekleyen İş Teklifleri</Text>
            <Text className="mt-1 text-2xl font-bold text-brand-primary">0</Text>
            <Text className="mt-2 text-xs text-brand-muted">
              A4f-2'de dispatch teklif ekranı + aktif iş yönetimi gelecek.
            </Text>
          </View>

          <Button
            label="Çıkış Yap"
            variant="ghost"
            onPress={() => {
              void handleLogout();
            }}
            loading={loggingOut}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
