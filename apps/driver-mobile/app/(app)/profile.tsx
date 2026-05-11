import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/Button";
import { useAuth } from "../../src/hooks/use-auth";

export default function ProfileScreen() {
  const { state, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (state.status !== "authenticated") return null;
  const { user } = state;

  function confirmSignOut(): void {
    Alert.alert("Çıkış Yap", "Çıkış yaparsan online statün otomatik kapanır.", [
      { text: "İptal", style: "cancel" },
      {
        text: "Çıkış",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setSigningOut(true);
            try {
              await logout();
            } finally {
              setSigningOut(false);
            }
          })();
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <ScrollView contentContainerClassName="gap-6 px-6 py-8">
        <Text className="text-3xl font-bold text-brand-primary">Profil</Text>

        <View className="gap-3 rounded-2xl bg-neutral-100 p-6">
          <InfoRow label="İsim" value={user.displayName ?? "—"} />
          <InfoRow label="Telefon" value={user.phoneE164} />
          <InfoRow label="Rol" value="Sürücü" />
          <InfoRow label="Profil ID" value={user.driverProfileId ?? "—"} />
        </View>

        <View className="gap-2 rounded-2xl bg-neutral-100 p-6">
          <Text className="text-base text-brand-primary">Closed-beta üyesi</Text>
          <Text className="text-sm text-brand-muted">
            Soruların için Event Fleet operasyon ekibiyle iletişime geç.
          </Text>
        </View>

        <Button label="Çıkış Yap" onPress={confirmSignOut} variant="ghost" loading={signingOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-brand-muted">{label}</Text>
      <Text className="text-sm font-medium text-brand-primary" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
