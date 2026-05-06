import { Pressable, Text, View } from "react-native";

import { formatTrCurrency } from "../lib/format/currency";

import type { PricingRuleResponse } from "../lib/api/pricing";

export interface AddonSelectorProps {
  addons: PricingRuleResponse[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}

export function AddonSelector({
  addons,
  selectedIds,
  onToggle,
  disabled = false,
}: AddonSelectorProps) {
  if (addons.length === 0) return null;

  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-brand-primary">Ek hizmetler</Text>
      {addons.map((addon) => {
        const selected = selectedIds.includes(addon.id);
        return (
          <Pressable
            key={addon.id}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected, disabled }}
            onPress={() => {
              onToggle(addon.id);
            }}
            className={`flex-row items-center justify-between rounded-xl border p-4 ${
              selected ? "border-brand-accent bg-brand-surface" : "border-neutral-200 bg-white"
            } ${disabled ? "opacity-50" : ""}`}
          >
            <View className="flex-1 flex-row items-center gap-3">
              <View
                className={`h-5 w-5 rounded border-2 ${
                  selected ? "border-brand-accent bg-brand-accent" : "border-neutral-300"
                }`}
              />
              <View className="flex-1">
                <Text className="text-base text-brand-primary">{addon.name}</Text>
                {addon.description !== null && (
                  <Text className="text-xs text-brand-muted">{addon.description}</Text>
                )}
              </View>
            </View>
            <Text className="text-base font-medium text-brand-primary">
              {addon.fixedAmount === null ? "—" : `${formatTrCurrency(addon.fixedAmount)} ₺`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
