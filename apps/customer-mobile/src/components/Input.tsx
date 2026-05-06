import { forwardRef } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null | undefined;
  hint?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, ...rest },
  ref,
) {
  const hasError = typeof error === "string" && error.length > 0;
  return (
    <View className="w-full">
      {label !== undefined && (
        <Text className="mb-2 text-sm font-medium text-brand-primary">{label}</Text>
      )}
      <TextInput
        ref={ref}
        placeholderTextColor="#9ca3af"
        className={`h-14 rounded-xl border px-4 text-base text-brand-primary ${
          hasError ? "border-brand-danger bg-red-50" : "border-neutral-300 bg-white"
        }`}
        {...rest}
      />
      {hasError ? (
        <Text className="mt-1 text-sm text-brand-danger">{error}</Text>
      ) : hint !== undefined ? (
        <Text className="mt-1 text-sm text-brand-muted">{hint}</Text>
      ) : null}
    </View>
  );
});
