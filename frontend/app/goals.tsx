import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDays, format, startOfDay } from "date-fns";
import { db, Item, useCol } from "@/src/store/db";
import { spacing, useTheme } from "@/src/theme";
import { durLabel, fmtDay, todayKey } from "@/src/engine/time";
import { scheduleReminder } from "@/src/engine/notify";
import { Badge, Btn, Check, ChipRow, Divider, Empty, Fab, Glass, IconBtn, Progress, Row, Screen, T } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

const ROUTINE_TEMPLATES: Record<string, { title: string; kind: string; steps: [string, number][] }> = {
  morning: { title: "Morning routine", kind: "morning", steps: [["Water", 2], ["Stretch", 10], ["Shower", 15], ["Breakfast", 20], ["Review today's plan", 5]] },
  evening: { title: "Evening routine", kind: "evening", steps: [["Tidy up", 10], ["Prepare tomorrow", 10], ["Read", 20], ["Screens off", 1]] },
  study: { title: "Study routine", kind: "study", steps: [["Clear desk", 3], ["Review flashcards", 15], ["Focus session", 25], ["Break", 5], ["Practice questions", 20]] },
  work: { title: "Work start", kind: "work", steps: [["Check calendar", 5], ["Pick top 3", 5], ["Deep work block", 90]] },
};

function streak(log: string[] = []) {
  const set = new Set(log); let n = 0;
  for (let d = new Date(); set.has(format(d, "yyyy-MM-dd")); d = addDays(d, -1)) n++;
  if (!n && set.has(format(addDays(new Date(), -1), "yyyy-MM-dd"))) for (let d = addDays(new Date(), -1); set.has(format(d, "yyyy-MM-dd")); d = addDays(d, -1)) n++;
  return n;
}

export default function Goals() {
  const insets = useSafeAreaInsets(); const { colors } = useTheme(); const ui = useUI();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<"goals" | "habits" | "routines">((params.tab as any) ?? "goals");
  const goals = useCol("goals"); const habits = useCol("habits"); const routines = useCol("routines"); useCol("tasks");
  const tk = todayKey();

  const goalForm = (g?: Item) => ui.form({ title: g ? "Edit goal" : "New goal", initial: g ?? { term: "short", target: 100, unit: "%" }, fields: [
    { key: "title", label: "Goal", type: "text", required: true }, { key: "term", label: "Horizon", type: "select", options: [{ label: "Short-term", value: "short" }, { label: "Long-term", value: "long" }] },
    { key: "areaId", label: "Category / life area", type: "select", options: db.list("lifeAreas").map((a) => ({ label: a.name, value: a.id })) },
    { key: "target", label: "Measurable target", type: "number", required: true }, { key: "unit", label: "Unit", type: "text" }, { key: "current", label: "Current value", type: "number" },
    { key: "deadline", label: "Deadline", type: "date" }, { key: "reviewAt", label: "Review reminder", type: "datetime" }, { key: "parentId", label: "Sub-goal of", type: "select", options: goals.filter((x) => x.id !== g?.id).map((x) => ({ label: x.title, value: x.id })) },
    { key: "notes", label: "Why it matters", type: "multiline" },
  ], onSubmit: async (v) => {
    if (v.target <= 0) return "Target must be greater than 0.";
    if (g) { db.update("goals", g.id, { ...v, progressHistory: v.current !== g.current ? [...(g.progressHistory ?? []), { date: new Date().toISOString(), value: v.current }] : g.progressHistory }); }
    else db.add("goals", { current: 0, milestones: [], progressHistory: [], ...v });
    if (v.reviewAt && new Date(v.reviewAt) > new Date()) await scheduleReminder(`Review goal: ${v.title}`, new Date(v.reviewAt), { kind: "goal" });
  }, onDelete: g ? () => { db.remove("goals", g.id); ui.toast("Goal deleted", () => db.undo()); } : undefined });

  const goalDetail = (g: Item) => ui.sheet(g.title, <GoalDetail id={g.id} edit={() => { ui.closeSheet(); setTimeout(() => goalForm(db.find("goals", g.id)), 250); }} />);

  const habitForm = (h?: Item) => ui.form({ title: h ? "Edit habit" : "New habit", initial: h ?? { schedule: "daily", targetPerWeek: 7 }, fields: [
    { key: "title", label: "Habit", type: "text", required: true }, { key: "schedule", label: "Schedule", type: "select", options: [{ label: "Daily", value: "daily" }, { label: "Weekly", value: "weekly" }, { label: "Custom days", value: "custom" }] },
    { key: "days", label: "Custom days", type: "multiselect", options: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => ({ label: d, value: i })) },
    { key: "targetPerWeek", label: "Flexible target (times per week)", type: "number" }, { key: "reminderTime", label: "Gentle reminder time", type: "time" }, { key: "notes", label: "Notes", type: "multiline" },
  ], onSubmit: async (v) => {
    if (h) db.update("habits", h.id, v); else db.add("habits", { log: [], ...v });
    if (v.reminderTime) { const [hh, mm] = v.reminderTime.split(":").map(Number); const d = new Date(); d.setHours(hh, mm, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); await scheduleReminder(`Gentle nudge: ${v.title}`, d, { kind: "habit" }); }
  }, onDelete: h ? () => { db.remove("habits", h.id); ui.toast("Habit deleted", () => db.undo()); } : undefined });

  return (
    <View style={{ flex: 1 }}>
      <Screen testID="goals-screen" title="Goals & Habits" subtitle="Progress without pressure" bottomPad={insets.bottom + 100}
        header={<ChipRow testID="goals-tab" value={tab} onChange={setTab} options={[{ label: "Goals", value: "goals" }, { label: "Habits", value: "habits" }, { label: "Routines", value: "routines" }]} />}>
        {tab === "goals" ? (goals.length ? goals.map((g) => {
          const pct = (g.current ?? 0) / (g.target || 1);
          const linked = db.list("tasks").filter((t) => t.goalId === g.id);
          return (
            <Glass key={g.id} testID={`goal-card-${g.id}`} onPress={() => goalDetail(g)} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><T v="headline" style={{ flex: 1 }}>{g.parentId ? "↳ " : ""}{g.title}</T><Badge label={g.term === "long" ? "long-term" : "short-term"} tone="muted" /></View>
              <Progress value={pct} />
              <T v="caption" muted>{g.current ?? 0}/{g.target} {g.unit} · {Math.round(pct * 100)}%{g.deadline ? ` · by ${fmtDay(g.deadline)}` : ""} · {(g.milestones ?? []).filter((m: any) => m.done).length}/{(g.milestones ?? []).length} milestones · {linked.length} tasks</T>
            </Glass>);
        }) : <Empty testID="goals-empty" icon="flag-outline" title="No goals yet" body="Set a measurable target and break it into milestones and tasks." action="New goal" onAction={() => goalForm()} />) : null}

        {tab === "habits" ? (habits.length ? habits.map((h) => {
          const on = (h.log ?? []).includes(tk);
          const week = Array.from({ length: 7 }, (_, i) => format(addDays(startOfDay(new Date()), i - 6), "yyyy-MM-dd"));
          const weekCount = week.filter((d) => h.log?.includes(d)).length;
          return (
            <Glass key={h.id} testID={`habit-card-${h.id}`} style={{ gap: 8 }}>
              <Row title={h.title} subtitle={`${h.schedule}${h.days?.length ? " · " + h.days.map((d: number) => "SMTWTFS"[d]).join("") : ""} · streak ${streak(h.log)}d · ${weekCount}/${h.targetPerWeek ?? 7} this week`} onPress={() => habitForm(h)}
                left={<Check testID={`habit-check-${h.id}`} label={`Log ${h.title}`} on={on} onPress={() => { db.update("habits", h.id, { log: on ? h.log.filter((d: string) => d !== tk) : [...(h.log ?? []), tk] }, "Log habit"); if (!on) ui.toast("Nice — logged for today"); }} />} />
              <View style={{ flexDirection: "row", gap: 6 }}>{week.map((d) => { const done = h.log?.includes(d); return (
                <View key={d} style={{ flex: 1, alignItems: "center", gap: 2 }}>
                  <T v="caption" muted>{format(new Date(d), "EEEEE")}</T>
                  <View testID={`habit-day-${h.id}-${d}`} onTouchEnd={() => d !== tk && db.update("habits", h.id, { log: done ? h.log.filter((x: string) => x !== d) : [...(h.log ?? []), d] }, "Recover missed day")} style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: done ? colors.success : colors.surfaceTertiary }} />
                </View>); })}</View>
              <T v="caption" muted>Missed a day? Tap it to log it late — streaks forgive honest catch-ups.{h.notes ? " · " + h.notes : ""}</T>
            </Glass>);
        }) : <Empty testID="habits-empty" icon="repeat-outline" title="No habits yet" body="Start small. Flexible weekly targets are fine." action="New habit" onAction={() => habitForm()} />) : null}

        {tab === "routines" ? <>
          {routines.map((r) => <RoutineCard key={r.id} r={r} />)}
          {!routines.length ? <Empty testID="routines-empty" icon="list-outline" title="No routines" body="Pick a template below or build your own." /> : null}
          <T v="headline">Templates</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{Object.entries(ROUTINE_TEMPLATES).map(([k, t]) => <Btn key={k} small kind="secondary" testID={`routine-template-${k}`} label={t.title} onPress={() => { db.add("routines", { title: t.title, kind: t.kind, steps: t.steps.map(([title, min], i) => ({ id: `${Date.now().toString(36)}${i}`, title, min, done: false })) }); ui.toast("Routine added"); }} />)}</View>
        </> : null}
      </Screen>
      <Fab testID="goals-add-fab" bottom={insets.bottom + 16} onPress={() => (tab === "goals" ? goalForm() : tab === "habits" ? habitForm() : ui.form({ title: "New routine", fields: [{ key: "title", label: "Name", type: "text", required: true }, { key: "kind", label: "Type", type: "select", options: ["morning", "evening", "study", "work", "custom"].map((x) => ({ label: x, value: x })) }, { key: "steps", label: "Steps (one per line, optional 'Step - 10')", type: "multiline", required: true }], onSubmit: (v) => { db.add("routines", { title: v.title, kind: v.kind || "custom", steps: String(v.steps).split("\n").filter(Boolean).map((l, i) => { const m = l.match(/^(.*?)(?:\s*-\s*(\d+))?$/)!; return { id: Date.now().toString(36) + i, title: m[1].trim(), min: +(m[2] ?? 5), done: false }; }) }); } }))} />
    </View>
  );
}

function GoalDetail({ id, edit }: { id: string; edit: () => void }) {
  const ui = useUI(); useCol("goals"); useCol("tasks");
  const g = db.find("goals", id); if (!g) return null;
  const ms = g.milestones ?? [];
  const tasks = db.list("tasks").filter((t) => t.goalId === g.id);
  const projects = db.list("projects").filter((p) => p.goalId === g.id);
  const bump = (d: number) => { const v = Math.max(0, (g.current ?? 0) + d); db.update("goals", g.id, { current: v, progressHistory: [...(g.progressHistory ?? []), { date: new Date().toISOString(), value: v }] }, "Goal progress"); };
  return (
    <View style={{ gap: 10 }} testID="goal-detail">
      <T>{g.current ?? 0}/{g.target} {g.unit}</T><Progress value={(g.current ?? 0) / (g.target || 1)} />
      <View style={{ flexDirection: "row", gap: 8 }}><Btn small kind="secondary" label="-1" testID="goal-dec" onPress={() => bump(-1)} /><Btn small label="+1" testID="goal-inc" onPress={() => bump(1)} /><Btn small kind="secondary" label="+5" onPress={() => bump(5)} /><Btn small kind="ghost" label="Edit" testID="goal-edit" onPress={edit} /></View>
      <T v="headline">Milestones</T>
      {ms.map((m: any) => <Row key={m.id} title={m.title} done={m.done} strike left={<Check label={m.title} on={m.done} onPress={() => db.update("goals", g.id, { milestones: ms.map((x: any) => (x.id === m.id ? { ...x, done: !x.done } : x)) })} />} />)}
      <Btn small kind="secondary" label="Add milestone" testID="goal-add-milestone" onPress={() => { ui.closeSheet(); ui.form({ title: "Milestone", fields: [{ key: "title", label: "Milestone", type: "text", required: true }, { key: "due", label: "Due", type: "date" }], onSubmit: (v) => { db.update("goals", g.id, { milestones: [...ms, { id: Date.now().toString(36), done: false, ...v }] }); } }); }} />
      <T v="headline">Related tasks ({tasks.length}) & projects ({projects.length})</T>
      {tasks.map((t) => <Row key={t.id} title={t.title} done={t.status === "done"} strike />)}
      <Btn small kind="secondary" label="Break goal into tasks" testID="goal-breakdown" onPress={() => {
        const steps = ms.filter((m: any) => !m.done).length ? ms.filter((m: any) => !m.done).map((m: any) => `${m.title}`) : ["Define first concrete step", "Schedule weekly progress check", "Remove one obstacle", "Measure and record progress"];
        db.addMany("tasks", steps.map((s: string) => ({ title: `${g.title}: ${s}`, goalId: g.id, status: "todo", priority: 3, subtasks: [], dependsOn: [], tags: ["goal"] })), "Goal breakdown");
        ui.toast(`${steps.length} tasks created (from ${ms.length ? "milestones" : "a generic template"})`, () => db.undo());
      }} />
      {(g.progressHistory ?? []).length ? <T v="caption" muted>History: {(g.progressHistory ?? []).slice(-6).map((p: any) => `${format(new Date(p.date), "d/M")}: ${p.value}`).join(" · ")}</T> : null}
      <Btn small kind="secondary" label={g.pinned ? "Unpin" : "Pin to Today"} onPress={() => db.update("goals", g.id, { pinned: !g.pinned })} />
    </View>
  );
}

function RoutineCard({ r }: { r: Item }) {
  const ui = useUI(); const { colors } = useTheme();
  const steps = r.steps ?? [];
  const total = steps.reduce((a: number, s: any) => a + (s.min ?? 0), 0);
  const done = steps.filter((s: any) => s.done || s.skipped).length;
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= steps.length) return; const c = [...steps]; [c[i], c[j]] = [c[j], c[i]]; db.update("routines", r.id, { steps: c }, "Reorder"); };
  const setStep = (id: string, patch: any) => db.update("routines", r.id, { steps: steps.map((s: any) => (s.id === id ? { ...s, ...patch } : s)) });
  return (
    <Glass testID={`routine-card-${r.id}`} style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}><T v="headline">{r.title}</T><T v="caption" muted>{r.kind} · ~{durLabel(total)} · {done}/{steps.length}{r.paused ? " · paused" : ""}</T></View>
        <Btn small kind={r.paused ? "primary" : "secondary"} testID={`routine-pause-${r.id}`} label={r.paused ? "Resume" : "Pause"} onPress={() => db.update("routines", r.id, { paused: !r.paused })} />
        <IconBtn label="Reset" icon="refresh" testID={`routine-reset-${r.id}`} onPress={() => db.update("routines", r.id, { steps: steps.map((s: any) => ({ ...s, done: false, skipped: false })), lastCompleted: done === steps.length ? new Date().toISOString() : r.lastCompleted })} />
        <IconBtn label="Delete routine" icon="trash-outline" onPress={async () => { if (await ui.confirm({ title: "Delete routine?", message: r.title, destructive: true })) { db.remove("routines", r.id); ui.toast("Deleted", () => db.undo()); } }} />
      </View>
      <Progress value={steps.length ? done / steps.length : 0} color={colors.success} />
      {steps.map((s: any, i: number) => (
        <View key={s.id}>{i ? <Divider /> : null}
          <Row title={s.title} subtitle={`${s.min}m${s.skipped ? " · skipped" : ""}`} done={s.done || s.skipped} strike
            left={<Check testID={`routine-step-${s.id}`} label={s.title} on={!!s.done} onPress={() => !r.paused && setStep(s.id, { done: !s.done, skipped: false })} />}
            right={<View style={{ flexDirection: "row", gap: 4 }}><IconBtn label="Skip" icon="play-skip-forward-outline" onPress={() => setStep(s.id, { skipped: !s.skipped })} /><IconBtn label="Move up" icon="arrow-up" onPress={() => move(i, -1)} /><IconBtn label="Move down" icon="arrow-down" onPress={() => move(i, 1)} /></View>} />
        </View>))}
      <View style={{ height: spacing.xs }} />
    </Glass>
  );
}
