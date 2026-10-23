import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDays, format, startOfDay } from "date-fns";
import { db, useCol } from "@/src/store/db";
import { durLabel } from "@/src/engine/time";
import { weeklyReview } from "@/src/engine/reports";
import { Bars, Btn, ChipRow, Glass, Progress, Screen, Section, Stat, T } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

export default function Analytics() {
  const insets = useSafeAreaInsets(); const ui = useUI();
  const [period, setPeriod] = useState<"7" | "30" | "90">("7");
  const tasks = useCol("tasks"); const focus = useCol("focusSessions"); const study = useCol("studySessions"); const habits = useCol("habits"); const logs = useCol("timeLogs"); const goals = useCol("goals"); const projects = useCol("projects"); const events = useCol("events");
  const n = +period; const from = addDays(startOfDay(new Date()), -(n - 1));
  const inP = (iso?: string) => !!iso && new Date(iso) >= from;
  const done = tasks.filter((t) => t.status === "done" && inP(t.completedAt));
  const unfinished = tasks.filter((t) => t.status !== "done" && t.due && inP(t.due) && new Date(t.due) < new Date());
  const planned = done.reduce((a, t) => a + (t.estMin || 0), 0), actual = done.reduce((a, t) => a + (t.actualMin || 0), 0);
  const fMin = focus.filter((f) => inP(f.start)).reduce((a, f) => a + f.minutes, 0);
  const sMin = study.filter((s) => inP(s.date)).reduce((a, s) => a + (s.actualMin || 0), 0) + focus.filter((f) => f.kind === "study" && inP(f.start)).reduce((a, f) => a + f.minutes, 0);
  const buckets = Math.min(n, 12); const size = Math.ceil(n / buckets);
  const series = Array.from({ length: buckets }, (_, i) => { const a = addDays(from, i * size), b = addDays(a, size); return { label: format(a, n > 7 ? "d/M" : "EEE"), value: tasks.filter((t) => t.status === "done" && t.completedAt && new Date(t.completedAt) >= a && new Date(t.completedAt) < b).length }; });
  const cats: Record<string, number> = {};
  logs.filter((l) => inP(l.date) && l.minutes).forEach((l) => (cats[l.category] = (cats[l.category] ?? 0) + l.minutes));
  focus.filter((f) => inP(f.start)).forEach((f) => (cats[f.kind === "study" ? "Study" : "Work"] = (cats[f.kind === "study" ? "Study" : "Work"] ?? 0) + f.minutes));
  const catData = Object.entries(cats).map(([k, v]) => ({ label: k.slice(0, 5), value: v }));
  const habitPct = habits.length ? habits.reduce((a, h) => a + Math.min(1, (h.log ?? []).filter((d: string) => new Date(d) >= from).length / ((h.targetPerWeek ?? 7) * (n / 7))), 0) / habits.length : null;
  const distractions = logs.filter((l) => l.distraction && inP(l.date));
  const changes = events.filter((e) => inP(e.updatedAt) && e.updatedAt !== e.createdAt).length;
  const leak = Object.entries(cats).filter(([k]) => ["Social media", "Entertainment", "Distraction"].includes(k)).reduce((a, [, v]) => a + v, 0);
  return (
    <Screen testID="analytics-screen" title="Analytics" subtitle="Computed from data stored on this device" bottomPad={insets.bottom + 40}
      header={<ChipRow testID="analytics-period" value={period} onChange={setPeriod} options={[{ label: "7 days", value: "7" }, { label: "30 days", value: "30" }, { label: "90 days", value: "90" }]} />}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Stat label="Completed" value={String(done.length)} icon="checkmark-done-outline" testID="analytics-completed" />
        <Stat label="Missed deadlines" value={String(unfinished.length)} icon="alert-circle-outline" />
        <Stat label="Focus" value={durLabel(fMin)} icon="timer-outline" />
        <Stat label="Study" value={durLabel(sMin)} icon="school-outline" />
      </View>
      <Section title="Completed tasks"><Glass><Bars testID="analytics-completed-chart" data={series} /></Glass></Section>
      <Section title="Planned vs actual time">
        <Glass style={{ gap: 6 }}>{planned && actual ? <><T>Estimated {durLabel(planned)} · actual {durLabel(actual)}</T><Progress value={planned / Math.max(planned, actual)} /><T v="caption" muted>Estimates were {Math.round((planned / actual) * 100)}% of actual time (tasks with both values).</T></> : <T muted>Log "Actual minutes" on completed tasks to measure this.</T>}</Glass>
      </Section>
      <Section title="Time by category (Time Leak Detector)">
        <Glass style={{ gap: 6 }}>{catData.length ? <Bars data={catData} unit="m" /> : <T muted>Log activities in Clock › Time log, or run focus sessions.</T>}
          {leak ? <T v="caption">Possible time leaks: {durLabel(leak)} in social media/entertainment/distractions.</T> : null}
          <T v="caption" muted>{distractions.length} distraction(s) logged in this period.</T></Glass>
      </Section>
      <Section title="Consistency & progress">
        <Glass style={{ gap: 8 }}>
          <T>Habit consistency: {habitPct === null ? "no habits" : Math.round(habitPct * 100) + "% of target"}</T>
          <T>Goals: {goals.length ? Math.round((goals.reduce((a, g) => a + Math.min(1, (g.current ?? 0) / (g.target || 1)), 0) / goals.length) * 100) + "% average progress" : "none"}</T>
          <T>Projects: {projects.map((p) => { const ts = tasks.filter((t) => t.projectId === p.id); return `${p.title} ${ts.length ? Math.round((ts.filter((t) => t.status === "done").length / ts.length) * 100) : 0}%`; }).join(" · ") || "none"}</T>
          <T>Schedule changes: {changes} event edit(s)</T>
        </Glass>
      </Section>
      <Btn testID="analytics-weekly-review" label="Weekly AI review (local)" icon="sparkles-outline" onPress={() => { const r = weeklyReview(); ui.sheet("Weekly review", <View style={{ gap: 8 }}><T>{r}</T><Btn label="Save as note" onPress={() => { db.add("notes", { title: "Weekly review " + format(new Date(), "d MMM"), body: r, folder: "Reviews", tags: ["review"] }); ui.closeSheet(); ui.toast("Saved"); }} /></View>); }} />
      <T v="caption" muted>No usage data is collected outside the app. Insights only reflect what you recorded.</T>
    </Screen>
  );
}
