import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../src/hooks/use-auth";
import { formatTrMobileForDisplay } from "../../src/lib/format/phone";

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: "Müşteri",
  DRIVER: "Sürücü",
  ADMIN: "Yönetici",
  SUPPORT: "Destek",
};

export default function ProfileScreen() {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <View className="flex-1 px-6 py-8">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-brand-primary">Profil</Text>
          <Pressable
            onPress={() => {
              router.back();
            }}
          >
            <Text className="text-sm font-semibold text-brand-primary">Kapat</Text>
          </Pressable>
        </View>

        <View className="mt-8 gap-4">
          <ProfileRow label="Ad Soyad" value={state.user.displayName ?? "—"} />
          <ProfileRow label="Telefon" value={formatTrMobileForDisplay(state.user.phoneE164)} />
          <ProfileRow label="Rol" value={ROLE_LABELS[state.user.role] ?? state.user.role} />
          <ProfileRow label="Kullanıcı ID" value={state.user.id} mono />
        </View>
      </View>
    </SafeAreaView>
  );
}

function ProfileRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View className="rounded-xl border border-neutral-200 bg-white p-4">
      <Text className="text-xs uppercase tracking-wide text-brand-muted">{label}</Text>
      <Text className={`mt-1 text-base text-brand-primary ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </Text>
    </View>
  );
}
