import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "./Button";

export interface LocationPermissionModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called when the user taps "İzin Ver". Caller fires the OS prompt. */
  onAllow: () => Promise<void>;
}

/**
 * Hybrid permission rationale modal. Shows BEFORE the OS prompt so
 * the user understands why we want location — iOS only lets you ask
 * once per install, so we want the OS dialog to land on a user who
 * already said "yes" to the rationale.
 *
 * Three reassurance bullets address the most common driver concerns
 * (1: "is it always on?", 2: "what happens when I'm offline?", 3:
 * "what's the data used for?"). Honest answers — there's nothing
 * here that the dispatch flow doesn't actually do.
 */
export function LocationPermissionModal({
  visible,
  onClose,
  onAllow,
}: LocationPermissionModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          className="gap-4 rounded-t-3xl bg-white p-6"
          onPress={(e) => {
            e.stopPropagation();
          }}
        >
          <View className="items-center">
            <Text className="mb-2 text-6xl">📍</Text>
            <Text className="text-center text-2xl font-bold text-brand-primary">
              Konum İzni Gerekiyor
            </Text>
            <Text className="mt-2 text-center text-base text-brand-muted">
              Sana yakın iş teklifleri bulabilmemiz için konumuna ihtiyacımız var.
            </Text>
          </View>

          <View className="gap-2 rounded-2xl bg-neutral-100 p-4">
            <Text className="text-sm text-brand-primary">
              ✓ Sadece sen "Çalışıyorum" yapınca aktif
            </Text>
            <Text className="text-sm text-brand-primary">✓ Kapalıyken konumun paylaşılmaz</Text>
            <Text className="text-sm text-brand-primary">
              ✓ Sadece sana yakın işleri bulmak için kullanılır
            </Text>
          </View>

          <Button
            label="İzin Ver"
            onPress={() => {
              void (async () => {
                await onAllow();
                onClose();
              })();
            }}
          />
          <Pressable onPress={onClose} className="py-3">
            <Text className="text-center text-brand-muted">Şimdi Değil</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
