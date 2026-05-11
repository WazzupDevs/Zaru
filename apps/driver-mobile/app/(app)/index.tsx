import * as Location from "expo-location";
import { useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LocationPermissionModal } from "../../src/components/LocationPermissionModal";
import { OnlineToggle } from "../../src/components/OnlineToggle";
import { useAuth } from "../../src/hooks/use-auth";
import { driverApi } from "../../src/lib/api";
import { formatTrMobileForDisplay } from "../../src/lib/format/phone";
import { Logger } from "../../src/lib/logger";

/**
 * Driver home — online toggle is the entire screen for A4f-1b. A4f-2
 * fills in dispatch offer + active job sections; A4f-3 adds background
 * location updates so we can drop the "initial position only" caveat.
 *
 * Online flow (offline → online):
 *   1. Tap → check existing permission state
 *   2a. granted     → straight to activateOnline()
 *   2b. denied + cannot ask again → Alert directing to OS settings
 *   2c. undetermined → rationale modal, on confirm fire requestPerms,
 *                      then activateOnline()
 *   3. activateOnline → getCurrentPosition (Balanced) → updateLocation
 *      → setOnlineStatus(true). The order matters: location must be
 *      fresh when isOnline flips, otherwise the dispatch matcher sees
 *      a stale row + filters this driver out.
 *
 * Online → offline is just setOnlineStatus(false). We deliberately do
 * NOT clear the location row server-side: subsequent online flips
 * within the dispatch location-freshness window (5 min) skip the
 * permission dance.
 */
export default function DriverHomeScreen() {
  const { state } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);

  if (state.status !== "authenticated") return null;
  const { user } = state;
  const driverProfileId = user.driverProfileId;

  // Driver mid-onboarding (whitelist accepted but DriverProfile not yet
  // created via supply). Show a friendly stub rather than letting them
  // tap online and 404.
  if (driverProfileId === null) {
    return (
      <SafeAreaView className="flex-1 bg-brand-surface">
        <ScrollView contentContainerClassName="px-6 py-8">
          <Text className="text-3xl font-bold text-brand-primary">Hoş geldin!</Text>
          <Text className="mt-4 text-base text-brand-muted">
            Onboarding süreci tamamlanmadı. Operasyon ekibimiz profil bilgilerini ayarladığında sana
            haber verecek.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Locked-in non-null reference for the closure callbacks below — TS
  // narrowing across the early-return is forgotten by `useState` /
  // function closures. Captured here once, used everywhere.
  const profileId: string = driverProfileId;

  async function activateOnline(): Promise<void> {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await driverApi.updateLocation(profileId, {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
      Logger.info("driver_location_updated");
      await driverApi.setOnlineStatus(profileId, true);
      setIsOnline(true);
      Logger.info("driver_online");
    } catch (err) {
      Logger.warn("driver_online_failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      Alert.alert("Hata", "Çalışmaya başlanamadı, tekrar dene.");
    }
  }

  async function handleToggle(): Promise<void> {
    if (isOnline) {
      try {
        await driverApi.setOnlineStatus(profileId, false);
        setIsOnline(false);
        Logger.info("driver_offline");
      } catch (err) {
        Logger.warn("driver_offline_failed", {
          message: err instanceof Error ? err.message : String(err),
        });
        Alert.alert("Hata", "Kapatılamadı, tekrar dene.");
      }
      return;
    }

    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.status === Location.PermissionStatus.GRANTED) {
      await activateOnline();
      return;
    }
    if (existing.status === Location.PermissionStatus.DENIED && !existing.canAskAgain) {
      Alert.alert(
        "Konum İzni Kapalı",
        "Çalışmak için cihaz ayarlarından konum iznini açman gerekiyor.",
        [
          { text: "İptal", style: "cancel" },
          {
            text: "Ayarlara Git",
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ],
      );
      return;
    }
    setPermissionModalVisible(true);
  }

  async function handleAllowFromModal(): Promise<void> {
    const result = await Location.requestForegroundPermissionsAsync();
    if (result.status === Location.PermissionStatus.GRANTED) {
      await activateOnline();
    } else {
      Logger.info("driver_location_permission_denied");
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-surface">
      <ScrollView contentContainerClassName="gap-6 px-6 py-8">
        <View>
          <Text className="text-3xl font-bold text-brand-primary">
            Merhaba {user.displayName ?? "Sürücü"}!
          </Text>
          <Text className="mt-1 text-base text-brand-muted">
            {formatTrMobileForDisplay(user.phoneE164)}
          </Text>
          {!state.verified && (
            <View className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
              <Text className="text-xs text-amber-700">
                Bağlantı bekleniyor — gösterilen bilgiler önbellekten.
              </Text>
            </View>
          )}
        </View>

        <OnlineToggle isOnline={isOnline} onToggle={handleToggle} />

        {/* Stats placeholder — A4f-2 reads from a real backend snapshot
            once the dispatch offer flow + booking history endpoints land. */}
        <View className="gap-1 rounded-2xl bg-neutral-100 p-6">
          <Text className="text-base text-brand-muted">Bugün</Text>
          <Text className="text-4xl font-bold text-brand-primary">0 iş</Text>
          <Text className="text-sm text-brand-muted">İş geldikçe burada görünür</Text>
        </View>
      </ScrollView>

      <LocationPermissionModal
        visible={permissionModalVisible}
        onClose={() => {
          setPermissionModalVisible(false);
        }}
        onAllow={handleAllowFromModal}
      />
    </SafeAreaView>
  );
}
