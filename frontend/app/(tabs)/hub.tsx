import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usesNativeTabs } from "@/src/navigation";
import { MODULES, useCol, useSettings } from "@/src/store/db";
import { radius, spacing, useTheme } from "@/src/theme";
import { Icon, IconBtn, Screen, Section, T } from "@/src/ui/kit";
import { QuickGrid } from "@/src/ui/quick";

export default function Hub() {
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const st = useSettings();
  const { colors } = useTheme();
  const queue = useCol("queue");
  const pending = queue.filter((q) => q.status === "pending").length;
  const mods = st.modules.filter((m) => m.visible && MODULES[m.key]);
  return (
    <Screen testID="hub-screen" back={false} title="Hub" subtitle="All modules · your Life OS" bottomPad={bottomChrome + spacing.xl}
      right={<IconBtn testID="hub-customize-button" label="Customize modules" icon="options" onPress={() => router.push("/settings?tab=modules")} />}>
      <Section title="Quick actions"><QuickGrid /></Section>
      <Section title="Modules">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {mods.map((m) => {
            const M = MODULES[m.key];
            return (
              <Pressable key={m.key} testID={`hub-module-${m.key}`} accessibilityRole="button" accessibilityLabel={M.label} onPress={() => router.push(M.route as any)}
                style={({ pressed }) => ({ width: "48%", flexGrow: 1, minHeight: 84, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, gap: 8, opacity: pressed ? 0.75 : 1 })}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}><Icon name={M.icon} size={19} color={colors.brandPrimary} /></View>
                  {m.key === "queue" && pending ? <T v="caption" color={colors.brandPrimary}>{pending} pending</T> : null}
                </View>
                <T v="headline" numberOfLines={1}>{M.label}</T>
              </Pressable>
            );
          })}
        </View>
      </Section>
      <T v="caption" muted style={{ textAlign: "center" }}>Hidden modules keep their data. Manage them in Settings › Modules.</T>
    </Screen>
  );
}
