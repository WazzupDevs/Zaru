import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";

import { Button } from "./Button";
import { Input } from "./Input";

export interface CancelBookingModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function CancelBookingModal({ visible, onClose, onConfirm }: CancelBookingModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setError("İptal sebebini yazın");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(trimmed);
      // Successful cancel — caller closes the modal + resets state.
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "İptal başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/50"
        onPress={() => {
          if (!submitting) onClose();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 justify-end"
        >
          <Pressable className="rounded-t-3xl bg-brand-surface p-6">
            <View className="mb-4 h-1 w-12 self-center rounded-full bg-neutral-300" />
            <Text className="text-xl font-bold text-brand-primary">Rezervasyonu İptal Et</Text>
            <Text className="mt-1 text-sm text-brand-muted">
              İptal sebebini kısaca yazın. Sürücü atandıysa kendisine de iletilecek.
            </Text>

            <View className="mt-6 gap-4">
              <Input
                label="Sebep"
                value={reason}
                onChangeText={(t) => {
                  setError(null);
                  setReason(t);
                }}
                placeholder="Örn: planlar değişti"
                multiline
                numberOfLines={3}
                editable={!submitting}
                error={error}
              />

              <Button
                label="İptal Et"
                variant="secondary"
                onPress={() => {
                  void handleSubmit();
                }}
                loading={submitting}
              />
              <Pressable onPress={onClose} disabled={submitting} className="items-center py-2">
                <Text className="text-sm font-medium text-brand-muted">Vazgeç</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
