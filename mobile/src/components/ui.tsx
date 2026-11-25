import React, { forwardRef, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { brand, radius, severityMeta, statusMeta, tint, type as t, useTheme } from '@/theme';
import { avatarColor, initials } from '@/lib/format';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? colors.text} style={style} />;
}

// --- Text ----------------------------------------------------------------------

type Variant = keyof typeof t;
export function T({
  v = 'body',
  color,
  style,
  children,
  ...rest
}: React.ComponentProps<typeof Text> & { v?: Variant; color?: 'primary' | 'secondary' | 'tertiary' | 'body' | 'accent' | 'danger' | string }) {
  const { colors } = useTheme();
  const c =
    color === undefined || color === 'primary'
      ? colors.text
      : color === 'secondary'
        ? colors.textSecondary
        : color === 'tertiary'
          ? colors.textTertiary
          : color === 'body'
            ? colors.textBody
            : color === 'accent'
              ? colors.accentText
              : color === 'danger'
                ? colors.danger
                : color;
  return (
    <Text style={[t[v], { color: c }, style]} {...rest}>
      {children}
    </Text>
  );
}

// --- Buttons -------------------------------------------------------------------

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  icon?: IconName;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'sm';
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, icon, loading, variant = 'primary', size = 'md', disabled, style, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const height = size === 'lg' ? 52 : size === 'sm' ? 36 : 44;
  const isDisabled = disabled || loading;
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? colors.danger : colors.text;
  const content = (
    <View style={[styles.btnInner, { height, paddingHorizontal: size === 'sm' ? 14 : 20 }]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={fg} /> : null}
          <Text style={[size === 'sm' ? t.smallStrong : t.bodyStrong, { color: fg }]}>{title}</Text>
        </>
      )}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        { opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.bg },
        variant === 'danger' && { borderWidth: 1, borderColor: tint(brand.red, 0.4), backgroundColor: tint(brand.red, 0.08) },
        style,
      ]}
      {...rest}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={brand.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.full }}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

/** Round icon-only button with a 44pt touch target. */
export function IconButton({
  name,
  onPress,
  label,
  color,
  size = 22,
  style,
  badge,
}: {
  name: IconName;
  onPress?: () => void;
  label: string;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  badge?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.bgTertiary }, style]}
    >
      <Ionicons name={name} size={size} color={color ?? colors.text} />
      {badge ? <View style={[styles.dot, { borderColor: colors.bg }]} /> : null}
    </Pressable>
  );
}

// --- Avatar ----------------------------------------------------------------------

export function Avatar({ name, seed, size = 40 }: { name: string | null | undefined; seed?: string; size?: number }) {
  const bg = avatarColor(seed ?? name);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}

// --- Chips -----------------------------------------------------------------------

export function Chip({ label, color, icon, style }: { label: string; color: string; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.chip, { backgroundColor: tint(color, 0.14) }, style]}>
      {icon ? <Ionicons name={icon} size={11} color={color} /> : null}
      <Text style={[t.tiny, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function StatusChip({ status }: { status: string }) {
  const m = statusMeta(status);
  return <Chip label={m.label} color={m.color} />;
}

export function SeverityChip({ severity }: { severity: number | null | undefined }) {
  const m = severityMeta(severity);
  return m ? <Chip label={m.label} color={m.color} /> : null;
}

export function CategoryChip({ category, subcategory }: { category: string | null; subcategory?: string | null }) {
  const { colors } = useTheme();
  if (!category) return null;
  return (
    <View style={[styles.chip, { backgroundColor: colors.bgTertiary }]}>
      <Text style={[t.tiny, { color: colors.textSecondary }]} numberOfLines={1}>
        {subcategory ? `${category} · ${subcategory}` : category}
      </Text>
    </View>
  );
}

/** Selectable pill used in filters and pickers. */
export function Pill({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.pill,
        {
          borderColor: selected ? brand.purpleStart : colors.border,
          backgroundColor: selected ? colors.accentSoft : pressed ? colors.bgTertiary : colors.bg,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? colors.accentText : colors.textSecondary} /> : null}
      <Text style={[t.smallStrong, { color: selected ? colors.accentText : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

// --- Inputs ----------------------------------------------------------------------

export const Field = forwardRef<TextInputInstance, TextInputProps & { label?: string; error?: string | null; hint?: string }>(
  function Field({ label, error, hint, style, multiline, ...rest }, ref) {
    const { colors } = useTheme();
    return (
      <View style={{ gap: 6 }}>
        {label ? <T v="smallStrong" color="secondary">{label}</T> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={label}
          multiline={multiline}
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.bgSecondary,
              borderColor: error ? colors.danger : colors.border,
              minHeight: multiline ? 96 : 48,
              textAlignVertical: multiline ? 'top' : 'center',
              paddingTop: multiline ? 12 : 0,
            },
            style,
          ]}
          {...rest}
        />
        {error ? <T v="small" color="danger">{error}</T> : hint ? <T v="small" color="tertiary">{hint}</T> : null}
      </View>
    );
  }
);

// --- Layout bits -------------------------------------------------------------------

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[{ backgroundColor: colors.bgSecondary, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16 }, style]}>
      {children}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={28} color={colors.accentText} />
      </View>
      <T v="heading" style={{ textAlign: 'center' }}>{title}</T>
      {body ? <T v="body" color="secondary" style={{ textAlign: 'center', maxWidth: 300 }}>{body}</T> : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export function Skeleton({ width, height, radius: r = 6, style }: { width: ViewStyle['width']; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: r, backgroundColor: colors.skeleton, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) },
        style,
      ]}
    />
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
      <T v="tiny" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 12 }}>
        {children}
      </T>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: radius.full, overflow: 'hidden' },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 9, right: 9, width: 10, height: 10, borderRadius: 5, backgroundColor: brand.red, borderWidth: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, maxWidth: 220 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 14, minHeight: 38 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10, paddingTop: 64 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
