import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, Item, useCol } from "@/src/store/db";
import { useTheme } from "@/src/theme";
import { AUTO_ACTIONS, AUTO_TEMPLATES, CONDITIONS, TRIGGERS, runAutomation } from "@/src/engine/automation";
import { fmtDT } from "@/src/engine/time";
import { Badge, Btn, Chip, Empty, Fab, Glass, Row, Screen, Section, T } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

const label = (arr: { label: string; value: string }[], v: string) => arr.find((x) => x.value === v)?.label ?? v;

export default function Automations() {
  const insets = useSafeAreaInsets(); const ui = useUI(); const { colors } = useTheme();
  const autos = useCol("automations");
  const form = (a?: Item) => ui.form({ title: a ? "Edit automation" : "New automation", initial: a ?? { trigger: "daily_time", condition: "always", action: "notify", enabled: true }, fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "trigger", label: "WHEN (trigger)", type: "select", required: true, options: TRIGGERS },
    { key: "triggerValue", label: "Trigger value", type: "text", help: "Daily: HH:mm · Weekly: 'day HH:mm' (0=Sun) · Deadline: hours" },
    { key: "condition", label: "IF (condition)", type: "select", required: true, options: CONDITIONS },
    { key: "conditionValue", label: "Condition value", type: "text" },
    { key: "action", label: "THEN (action)", type: "select", required: true, options: AUTO_ACTIONS },
    { key: "actionValue", label: "Action text (message or task title)", type: "text" },
    { key: "enabled", label: "Enabled", type: "toggle" },
  ], onSubmit: (v) => {
    if ((v.trigger === "daily_time") && v.triggerValue && !/^\d{1,2}:\d{2}$/.test(v.triggerValue)) return "Daily trigger needs HH:mm.";
    if (v.trigger === "weekly" && v.triggerValue && !/^[0-6] \d{1,2}:\d{2}$/.test(v.triggerValue)) return "Weekly trigger needs 'day HH:mm', e.g. '1 09:00'.";
    if (a) db.update("automations", a.id, v); else db.add("automations", { ...v, runs: 0 });
  }, onDelete: a ? () => { db.remove("automations", a.id); ui.toast("Automation deleted", () => db.undo()); } : undefined });
  return (
    <View style={{ flex: 1 }}>
      <Screen testID="automations-screen" title="Automations" subtitle="Trigger → Condition → Action, run locally" bottomPad={insets.bottom + 100}>
        {autos.length ? autos.map((a) => (
          <Glass key={a.id} testID={`automation-${a.id}`} style={{ gap: 6 }}>
            <Row title={a.name} subtitle={`WHEN ${label(TRIGGERS, a.trigger)}${a.triggerValue ? " (" + a.triggerValue + ")" : ""} · IF ${label(CONDITIONS, a.condition)} · THEN ${label(AUTO_ACTIONS, a.action)}`} onPress={() => form(a)}
              right={<Chip testID={`automation-toggle-${a.id}`} label={a.enabled ? "On" : "Off"} active={a.enabled} onPress={() => db.update("automations", a.id, { enabled: !a.enabled })} />} />
            <T v="caption" muted>Last run: {a.lastRun ? fmtDT(a.lastRun) : "never"} · runs {a.runs ?? 0}{a.lastResult ? " · " + a.lastResult : ""}</T>
            {a.error ? <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><Badge label="error" tone="error" /><T v="caption" color={colors.error} style={{ flex: 1 }}>{a.error}</T></View> : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Btn small kind="secondary" testID={`automation-test-${a.id}`} label="Test run" icon="play-outline" onPress={async () => { const r = await runAutomation(db.find("automations", a.id)!, true); ui.toast(r ?? "Done"); }} />
              {a.error ? <Btn small label="Retry" onPress={() => runAutomation(db.find("automations", a.id)!, true)} /> : null}
            </View>
          </Glass>)) : <Empty testID="automations-empty" icon="git-branch-outline" title="No automations" body="Start from a template below." />}
        <Section title="Templates">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{AUTO_TEMPLATES.map((t) => <Btn key={t.name} small kind="secondary" testID={`auto-template-${t.name.replace(/\W+/g, "-")}`} label={t.name} onPress={() => { db.add("automations", { ...t, enabled: true, runs: 0 }); ui.toast("Automation added"); }} />)}</View>
        </Section>
        <T v="caption" muted>Automations are evaluated when the app opens, returns to the foreground and every minute while open. Android restricts background execution, so they don't run while the app is fully closed; reminders you've scheduled still fire as OS notifications. Automations only perform the listed in-app actions; reschedules go to the Action Queue for your approval.</T>
      </Screen>
      <Fab testID="automations-add-fab" bottom={insets.bottom + 16} onPress={() => form()} />
    </View>
  );
}
