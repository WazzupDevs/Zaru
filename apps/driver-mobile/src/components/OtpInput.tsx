import { useEffect, useMemo, useRef } from "react";
import { TextInput, View } from "react-native";

export interface OtpInputProps {
  /** Current 6-digit value (controlled). Pad with empty string when shorter. */
  value: string;
  onChange: (next: string) => void;
  /** Visual error state (e.g., wrong OTP). */
  error?: boolean;
  /** Disable all boxes during verify-in-flight. */
  disabled?: boolean;
  /** Auto-focus the first empty box on mount (default true). */
  autoFocus?: boolean;
  length?: number;
}

/**
 * 6-digit OTP entry with auto-advance + backspace-back. Renders one
 * TextInput per digit (rather than a single masked input) because each
 * box gets its own focus ring, backspace handling, and easier paste-six
 * support — and because OS-level OTP-from-SMS autofill targets per-digit
 * inputs more reliably on iOS.
 *
 * Paste handling: when the user pastes the full 6-digit code into any
 * box, we detect (newDigit.length > 1) and stuff the whole value at once.
 */
export function OtpInput({
  value,
  onChange,
  error = false,
  disabled = false,
  autoFocus = true,
  length = 6,
}: OtpInputProps) {
  const refs = useRef<(TextInput | null)[]>([]);
  const digits = useMemo(() => {
    const padded = value.padEnd(length, " ");
    return Array.from({ length }, (_, i) => {
      const ch = padded[i];
      return ch === undefined || ch === " " ? "" : ch;
    });
  }, [value, length]);

  useEffect(() => {
    if (autoFocus) {
      const targetIndex = Math.min(value.length, length - 1);
      refs.current[targetIndex]?.focus();
    }
  }, [autoFocus, length, value.length]);

  const handleChange = (index: number, text: string) => {
    // Strip non-digits — iOS's "from-messages" autofill can include spaces.
    const digitsOnly = text.replace(/\D/g, "");

    // Paste case: more than one digit landed in one box → fill from here.
    if (digitsOnly.length > 1) {
      const next = (value.slice(0, index) + digitsOnly).slice(0, length);
      onChange(next);
      const focusTarget = Math.min(next.length, length - 1);
      refs.current[focusTarget]?.focus();
      return;
    }

    // Single digit (or empty backspace).
    const arr = digits.slice();
    arr[index] = digitsOnly;
    const next = arr.join("").trimEnd();
    onChange(next);

    if (digitsOnly !== "" && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (index: number, event: { nativeEvent: { key: string } }) => {
    // Backspace on an empty box → focus previous.
    if (event.nativeEvent.key === "Backspace" && digits[index] === "" && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <View className="flex-row justify-between">
      {digits.map((digit, i) => (
        <TextInput
          key={i}
          ref={(node) => {
            refs.current[i] = node;
          }}
          value={digit}
          onChangeText={(t) => {
            handleChange(i, t);
          }}
          onKeyPress={(e) => {
            handleKeyPress(i, e);
          }}
          keyboardType="number-pad"
          maxLength={length}
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          editable={!disabled}
          className={`h-16 w-12 rounded-xl border text-center text-2xl font-semibold text-brand-primary ${
            error
              ? "border-brand-danger bg-red-50"
              : "border-neutral-300 bg-white focus:border-brand-accent"
          } ${disabled ? "opacity-50" : ""}`}
        />
      ))}
    </View>
  );
}
