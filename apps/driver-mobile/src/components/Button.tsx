import {
  ActivityIndicator,
  Pressable,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Variant → tailwind class triples (background, text color, border).
// Kept here as plain strings rather than a `cva` wrapper since we only
// have three variants and the explicit form is easier to scan.
const variantClasses: Record<ButtonVariant, { container: string; label: string }> = {
  primary: {
    container: "bg-brand-primary active:bg-neutral-800",
    label: "text-brand-accent",
  },
  secondary: {
    container: "bg-brand-accent active:bg-yellow-600",
    label: "text-brand-primary",
  },
  ghost: {
    container: "bg-transparent border border-brand-primary active:bg-neutral-100",
    label: "text-brand-primary",
  },
};

export function Button({
  label,
  variant = "primary",
  loading = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || loading;
  const classes = variantClasses[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={style}
      className={`h-14 items-center justify-center rounded-xl px-6 ${classes.container} ${isDisabled ? "opacity-50" : ""}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#d4af37" : "#1a1a1a"} />
      ) : (
        <Text className={`text-base font-semibold ${classes.label}`}>{label}</Text>
      )}
    </Pressable>
  );
}
