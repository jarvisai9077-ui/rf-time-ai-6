import { Ionicons } from "@react-native-vector-icons/ionicons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ReactNode } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, StyleProp, Text, TextStyle, View, ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, radius, spacing, type, useTheme } from "@/src/theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export const Icon = ({ name, size = 20, color }: { name: string; size?: number; color?: string }) => {
  const { colors } = useTheme();
  return <Ionicons name={name as IconName} size={size} color={color ?? colors.onSurface} />;
};
export const tap = () => { if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {}); };

export function Backdrop() {
  const s = useStyles();
  return (
    <View pointerEvents="none" style={s.backdrop}>
      <View style={[s.blob, s.blobA]} />
      <View style={[s.blob, s.blobB]} />
    </View>
  );
}

export function Glass({ children, style, onPress, testID, strong }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string; strong?: boolean }) {
  const s = useStyles();
  const body = <View style={[s.glass, strong && s.glassStrong, style]}>{children}</View>;
  if (!onPress) return <View testID={testID}>{body}</View>;
  return <Pressable testID={testID} onPress={() => { tap(); onPress(); }} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}>{body}</Pressable>;
}

export function T({ children, v = "body", style, muted, color, numberOfLines, testID }: { children: ReactNode; v?: keyof typeof type; style?: StyleProp<TextStyle>; muted?: boolean; color?: string; numberOfLines?: number; testID?: string }) {
  const { colors } = useTheme();
  return <Text testID={testID} numberOfLines={numberOfLines} style={[type[v], { color: color ?? (muted ? colors.muted : colors.onSurface) }, style]}>{children}</Text>;
}

export function Btn({ label, onPress, icon, kind = "primary", testID, small, disabled, style }: { label: string; onPress: () => void; icon?: string; kind?: "primary" | "secondary" | "ghost" | "danger"; testID?: string; small?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const bg = kind === "primary" ? colors.brandPrimary : kind === "danger" ? colors.error : kind === "secondary" ? colors.brandTertiary : "transparent";
  const fg = kind === "primary" ? colors.onBrandPrimary : kind === "danger" ? colors.onError : kind === "secondary" ? colors.onBrandTertiary : colors.brandPrimary;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => [{ backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1, minHeight: small ? 36 : 48, paddingHorizontal: small ? 12 : 18, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, style]}>
      {icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: "700", fontSize: small ? 13 : 15 }}>{label}</Text>
    </Pressable>
  );
}

export function IconBtn({ icon, onPress, testID, label, color, filled }: { icon: string; onPress: () => void; testID?: string; label: string; color?: string; filled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} accessibilityLabel={label} accessibilityRole="button" hitSlop={6} onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: filled ? colors.brandPrimary : colors.glass, borderWidth: filled ? 0 : 1, borderColor: colors.glassBorder, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={20} color={filled ? colors.onBrandPrimary : color ?? colors.onSurface} />
    </Pressable>
  );
}

export function Chip({ label, active, onPress, testID, icon }: { label: string; active?: boolean; onPress: () => void; testID?: string; icon?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={() => { tap(); onPress(); }}
      style={{ height: 36, flexShrink: 0, paddingHorizontal: 14, borderRadius: radius.pill, flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: active ? colors.brandPrimary : colors.glass, borderWidth: 1, borderColor: active ? colors.brandPrimary : colors.border }}>
      {icon ? <Icon name={icon} size={14} color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary} /> : null}
      <Text style={{ fontSize: 13, fontWeight: "600", color: active ? colors.onBrandPrimary : colors.onSurfaceTertiary }}>{label}</Text>
    </Pressable>
  );
}
export function ChipRow<V extends string>({ options, value, onChange, testID }: { options: { label: string; value: V; icon?: string }[]; value: V; onChange: (v: V) => void; testID?: string }) {
  return (
    <ScrollView testID={testID} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 56 }} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.lg, alignItems: "center" }}>
      {options.map((o) => <Chip key={o.value} testID={`${testID ?? "chip"}-${o.value}`} label={o.label} icon={o.icon} active={o.value === value} onPress={() => onChange(o.value)} />)}
    </ScrollView>
  );
}

// Standard stack screen: sticky glass header, scroll body.
export function Screen({ title, subtitle, children, right, back = true, scroll = true, testID, onRefresh, header, padded = true, bottomPad }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode; back?: boolean; scroll?: boolean; testID?: string; onRefresh?: () => void; header?: ReactNode; padded?: boolean; bottomPad?: number }) {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const { colors, scheme } = useTheme();
  const bottom = bottomPad ?? insets.bottom + spacing.xl;
  return (
    <View testID={testID} style={s.screen}>
      <Backdrop />
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        {Platform.OS === "ios" ? <BlurView intensity={40} tint={scheme} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
        <View style={s.headerRow}>
          {back ? <IconBtn testID="header-back-button" label="Back" icon="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} /> : null}
          <View style={{ flex: 1 }}>
            <T v={back ? "title" : "largeTitle"} numberOfLines={1} testID="screen-title">{title}</T>
            {subtitle ? <T v="caption" muted numberOfLines={1}>{subtitle}</T> : null}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>{right}</View>
        </View>
        {header}
      </View>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: padded ? spacing.lg : 0, paddingBottom: bottom, gap: spacing.md }} refreshControl={onRefresh ? <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.brandPrimary} /> : undefined}>
          {children}
        </ScrollView>
      ) : <View style={{ flex: 1 }}>{children}</View>}
    </View>
  );
}

export function Section({ title, action, onAction, children, testID, delay = 0 }: { title: string; action?: string; onAction?: () => void; children: ReactNode; testID?: string; delay?: number }) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(300)} testID={testID} style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
        <T v="headline">{title}</T>
        {action ? <Pressable testID={testID ? `${testID}-action` : undefined} hitSlop={10} onPress={onAction}><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>{action}</Text></Pressable> : null}
      </View>
      {children}
    </Animated.View>
  );
}

export function Row({ title, subtitle, left, right, onPress, onLongPress, testID, done, strike }: { title: string; subtitle?: string; left?: ReactNode; right?: ReactNode; onPress?: () => void; onLongPress?: () => void; testID?: string; done?: boolean; strike?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}>
      {left}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={[type.body, { color: done ? colors.muted : colors.onSurface, fontWeight: "500", textDecorationLine: strike && done ? "line-through" : "none" }]}>{title}</Text>
        {subtitle ? <Text numberOfLines={2} style={[type.caption, { color: colors.muted, marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Check({ on, onPress, testID, label }: { on: boolean; onPress: () => void; testID?: string; label: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} hitSlop={10} onPress={() => { tap(); onPress(); }}
      style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: on ? colors.success : colors.borderStrong, backgroundColor: on ? colors.success : "transparent", alignItems: "center", justifyContent: "center" }}>
      {on ? <Icon name="checkmark" size={16} color={colors.onSuccess} /> : null}
    </Pressable>
  );
}

export function Empty({ icon = "sparkles-outline", title, body, action, onAction, testID }: { icon?: string; title: string; body?: string; action?: string; onAction?: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Glass testID={testID} style={{ alignItems: "center", paddingVertical: spacing.xl, gap: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={26} color={colors.brandPrimary} /></View>
      <T v="headline" style={{ textAlign: "center" }}>{title}</T>
      {body ? <T muted style={{ textAlign: "center", paddingHorizontal: spacing.lg }}>{body}</T> : null}
      {action && onAction ? <Btn testID={testID ? `${testID}-action` : undefined} small label={action} onPress={onAction} style={{ marginTop: 6 }} /> : null}
    </Glass>
  );
}

export function Progress({ value, color, height = 8 }: { value: number; color?: string; height?: number }) {
  const { colors } = useTheme();
  return <View style={{ height, borderRadius: height, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}><View style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, height, backgroundColor: color ?? colors.brandPrimary, borderRadius: height }} /></View>;
}

export function Bars({ data, unit = "", testID, height = 120 }: { data: { label: string; value: number; value2?: number }[]; unit?: string; testID?: string; height?: number }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.value2 ?? 0)));
  return (
    <View testID={testID} accessibilityLabel={data.map((d) => `${d.label} ${Math.round(d.value)}${unit}`).join(", ")} style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: height + 34 }}>
      {data.map((d, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 10, color: colors.muted }} numberOfLines={1}>{Math.round(d.value)}{unit}</Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height }}>
            {d.value2 !== undefined ? <View style={{ width: 8, height: Math.max(2, (d.value2 / max) * height), backgroundColor: colors.borderStrong, borderRadius: 4 }} /> : null}
            <View style={{ width: d.value2 !== undefined ? 8 : 16, height: Math.max(2, (d.value / max) * height), backgroundColor: colors.brandPrimary, borderRadius: 4 }} />
          </View>
          <Text style={{ fontSize: 10, color: colors.muted }} numberOfLines={1}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function Stat({ label, value, icon, testID, hint }: { label: string; value: string; icon: string; testID?: string; hint?: string }) {
  const { colors } = useTheme();
  return (
    <Glass style={{ flex: 1, minWidth: 140, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name={icon} size={16} color={colors.brandPrimary} /><T v="caption" muted>{label}</T></View>
      <T v="title" testID={testID}>{value}</T>
      {hint ? <T v="caption" muted>{hint}</T> : null}
    </Glass>
  );
}

export function Badge({ label, tone = "brand", testID }: { label: string; tone?: "brand" | "success" | "warning" | "error" | "muted" | "info"; testID?: string }) {
  const { colors } = useTheme();
  const bg = tone === "brand" ? colors.brandTertiary : tone === "muted" ? colors.surfaceTertiary : colors[tone];
  const fg = tone === "brand" ? colors.onBrandTertiary : tone === "muted" ? colors.onSurfaceTertiary : (colors as any)["on" + tone[0].toUpperCase() + tone.slice(1)];
  return <View testID={testID} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: bg, alignSelf: "flex-start" }}><Text style={{ fontSize: 11, fontWeight: "700", color: fg }}>{label}</Text></View>;
}

export function Fab({ onPress, testID, icon = "add", bottom }: { onPress: () => void; testID: string; icon?: string; bottom: number }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} accessibilityLabel="Add" accessibilityRole="button" onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => ({ position: "absolute", right: spacing.lg, bottom, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", shadowColor: colors.brandPrimary, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
      <Icon name={icon} size={28} color={colors.onBrandPrimary} />
    </Pressable>
  );
}

export const Divider = () => { const { colors } = useTheme(); return <View style={{ height: 1, backgroundColor: colors.divider }} />; };

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  backdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden" },
  blob: { position: "absolute", borderRadius: 400 },
  blobA: { width: 380, height: 380, top: -140, right: -120, backgroundColor: c.blobA },
  blobB: { width: 300, height: 300, top: 260, left: -160, backgroundColor: c.blobB },
  glass: { backgroundColor: c.glass, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: c.glassBorder, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  glassStrong: { backgroundColor: c.sheet },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: Platform.OS === "ios" ? "transparent" : c.glass, borderBottomWidth: 1, borderBottomColor: c.divider, overflow: "hidden" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48 },
}));
