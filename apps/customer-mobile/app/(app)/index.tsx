import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/Button";
import { useAuth } from "../../src/hooks/use-auth";
import { formatTrMobileForDisplay } from "../../src/lib/format/phone";

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

  if (state.status !== "authenticated") {
    // The root index.tsx redirect should keep us out of here when
    // unauthenticated, but the type narrowing requires the guard.
    return null;
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <View className="flex-1 px-6 py-8">
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="text-2xl font-bold text-brand-primary">
              Hoş geldiniz{state.user.displayName !== null ? `, ${state.user.displayName}` : ""}
            </Text>
            <Text className="mt-1 text-sm text-brand-muted">
              {formatTrMobileForDisplay(state.user.phoneE164)}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              router.push("/(app)/profile");
            }}
            className="h-10 w-10 items-center justify-center rounded-full bg-brand-primary"
          >
            <Text className="text-base font-semibold text-brand-accent">
              {(state.user.displayName ?? state.user.phoneE164).charAt(0).toUpperCase()}
            </Text>
          </Pressable>
        </View>

        <View className="mt-12 flex-1 items-center justify-center">
          <Text className="text-center text-base text-brand-muted">
            Müşteri rezervasyon akışı bir sonraki oturumda (A4d-2) gelecek.
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
    </SafeAreaView>
  );
}
