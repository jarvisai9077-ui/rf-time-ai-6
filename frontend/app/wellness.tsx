import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDays, format, startOfDay } from "date-fns";
import { db, useCol, useSettings } from "@/src/store/db";
import { fmtDT, todayKey } from "@/src/engine/time";
import { scheduleReminder } from "@/src/engine/notify";
import { Bars, Btn, ChipRow, Glass, Screen, Section, Stat, T } from "@/src/ui/kit";
import { CollectionList } from "@/src/ui/collection";
import { useUI } from "@/src/ui/overlay";

export default function Wellness() {
  const insets = useSafeAreaInsets(); const ui = useUI(); const st = useSettings();
  const [tab, setTab] = useState<"today" | "log" | "goals">("today");
  const logs = useCol("wellness");
  const tk = todayKey();
  const today = logs.filter((l) => l.date?.slice(0, 10) === tk);
  const water = today.filter((l) => l.kind === "water").reduce((a, l) => a + (l.value || 0), 0);
  const days = Array.from({ length: 7 }, (_, i) => format(addDays(startOfDay(new Date()), i - 6), "yyyy-MM-dd"));
  const sleep = days.map((d) => ({ label: d.slice(8), value: logs.filter((l) => l.kind === "sleep" && l.date?.slice(0, 10) === d).reduce((a, l) => a + (l.value || 0), 0) }));
  const repeatReminder = async (title: string, everyMin: number, count: number) => {
    let ok = 0; let err = "";
    for (let i = 1; i <= count; i++) { const r = await scheduleReminder(title, new Date(Date.now() + everyMin * 60000 * i), { kind: "wellness", priority: "low" }); if (!r.error) ok++; else err = r.error; }
    ui.toast(ok ? `${ok} reminder(s) scheduled (quiet hours respected)` : err);
  };
  return (
    <Screen testID="wellness-screen" title="Wellness" subtitle="Personal, non-medical planner" bottomPad={insets.bottom + 40}
      header={<ChipRow testID="wellness-tab" value={tab} onChange={setTab} options={[{ label: "Today", value: "today" }, { label: "Log", value: "log" }, { label: "Goals", value: "goals" }]} />}>
      {tab === "today" ? <>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}><Stat label="Water today" value={`${water} glass`} icon="water-outline" testID="wellness-water" /><Stat label="Activity" value={`${today.filter((l) => l.kind === "activity").reduce((a, l) => a + (l.value || 0), 0)}m`} icon="walk-outline" /></View>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Btn testID="wellness-add-water" small label="+1 glass" icon="water" onPress={() => db.add("wellness", { kind: "water", value: 1, date: new Date().toISOString() })} />
          <Btn small kind="secondary" label="Water reminders (2h × 4)" onPress={() => repeatReminder("Time for some water 💧", 120, 4)} />
          <Btn small kind="secondary" label="Break reminders (50m × 3)" onPress={() => repeatReminder("Stand up & stretch", 50, 3)} />
        </View>
        <Section title="Sleep (hours, 7 days)"><Glass><Bars testID="sleep-chart" unit="h" data={sleep} /><T v="caption" muted>Sleep schedule: {st.sleepStart}–{st.sleepEnd} (edit in Settings; the planner never books into it).</T></Glass></Section>
        <Section title="Weekly summary"><Glass><T>Water: {logs.filter((l) => l.kind === "water" && days.includes(l.date?.slice(0, 10))).reduce((a, l) => a + l.value, 0)} glasses · Activity: {logs.filter((l) => l.kind === "activity" && days.includes(l.date?.slice(0, 10))).reduce((a, l) => a + l.value, 0)} min · Avg sleep: {(sleep.reduce((a, s) => a + s.value, 0) / Math.max(1, sleep.filter((s) => s.value).length)).toFixed(1)}h</T></Glass></Section>
        <T v="caption" muted>TIME AI does not provide medical advice or diagnoses and is not a substitute for professional care.</T>
      </> : null}
      {tab === "log" ? <CollectionList testID="wellness-log" col="wellness" addLabel="Log entry" emptyTitle="No entries" defaults={{ kind: "activity", date: new Date().toISOString() }} sort={(a, b) => b.date.localeCompare(a.date)}
        fields={[{ key: "kind", label: "Type", type: "select", required: true, options: [{ label: "Sleep (hours)", value: "sleep" }, { label: "Water (glasses)", value: "water" }, { label: "Activity (minutes)", value: "activity" }, { label: "Rest/break (minutes)", value: "break" }, { label: "Wellness habit", value: "habit" }] }, { key: "value", label: "Amount", type: "number", required: true }, { key: "date", label: "When", type: "datetime", required: true }, { key: "note", label: "Note", type: "text" }]}
        title={(l) => `${l.kind}: ${l.value}`} subtitle={(l) => fmtDT(l.date) + (l.note ? " · " + l.note : "")} /> : null}
      {tab === "goals" ? <CollectionList testID="wellness-goals" col="goals" filter={(g) => g.areaId === "wellness"} defaults={{ areaId: "wellness", current: 0, milestones: [], term: "short" }} addLabel="Add wellness goal" emptyTitle="No wellness goals"
        fields={[{ key: "title", label: "Goal", type: "text", required: true }, { key: "target", label: "Target", type: "number", required: true }, { key: "unit", label: "Unit", type: "text" }, { key: "current", label: "Current", type: "number" }]} title={(g) => g.title} subtitle={(g) => `${g.current ?? 0}/${g.target} ${g.unit ?? ""}`} /> : null}
    </Screen>
  );
}
