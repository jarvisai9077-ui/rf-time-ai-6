import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, Item, useCol, useSettings } from "@/src/store/db";
import { useTheme } from "@/src/theme";
import { deadlineRisk, depsOpen } from "@/src/engine/planner";
import { durLabel, fmtDay } from "@/src/engine/time";
import { Badge, Btn, Check, Divider, Glass, IconBtn, Progress, Row, Screen, Section, T } from "@/src/ui/kit";
import { completeTask, saveTask, taskFields } from "@/src/ui/forms";
import { useUI } from "@/src/ui/overlay";
import { projectForm } from "../projects";

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets(); const ui = useUI(); const { colors } = useTheme(); const st = useSettings();
  useCol("projects"); const all = useCol("tasks"); const notes = useCol("notes");
  const p = db.find("projects", id);
  if (!p) return <Screen title="Project"><T>Project not found.</T></Screen>;
  const ts = all.filter((t) => t.projectId === p.id);
  const done = ts.filter((t) => t.status === "done");
  const remaining = ts.filter((t) => t.status !== "done");
  const remMin = remaining.reduce((a, t) => a + (t.estMin || 0), 0);
  const missingEst = remaining.filter((t) => !t.estMin).length;
  const ms = p.milestones ?? [];
  // critical path: longest chain of open dependent tasks
  const depth = (t: Item, seen = new Set<string>()): number => { if (seen.has(t.id)) return 0; seen.add(t.id); const deps = depsOpen(t); return (t.estMin || 30) + (deps.length ? Math.max(...deps.map((d) => depth(d, seen))) : 0); };
  const critical = remaining.length ? remaining.reduce((a, b) => (depth(b) > depth(a) ? b : a)) : null;
  const risk = p.deadline ? deadlineRisk({ ...p, due: p.deadline } as any, st) : null;
  const addTask = () => ui.form({ title: "Project task", fields: taskFields(), initial: { projectId: p.id }, onSubmit: (v) => saveTask({ ...v, projectId: p.id }) });
  return (
    <Screen testID="project-detail-screen" title={p.title} subtitle={`${p.status ?? "active"}${p.deadline ? " · due " + fmtDay(p.deadline) : ""}`} bottomPad={insets.bottom + 40}
      right={<IconBtn testID="project-edit-button" label="Edit project" icon="create-outline" onPress={() => projectForm(ui, p)} />}>
      <Glass style={{ gap: 8 }}>
        <Progress value={ts.length ? done.length / ts.length : 0} />
        <T>{done.length}/{ts.length} tasks done · {durLabel(remMin)} remaining{missingEst ? ` (+${missingEst} unestimated — estimate incomplete)` : ""}</T>
        {risk ? <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><Badge label={risk.level} tone={risk.level === "at risk" ? "error" : risk.level === "tight" ? "warning" : "success"} /><T v="caption" muted style={{ flex: 1 }}>{risk.detail}</T></View> : null}
        {critical ? <T v="caption" muted>Critical prerequisite chain ends at: "{critical.title}" (~{durLabel(depth(critical))})</T> : null}
        {p.description ? <T muted>{p.description}</T> : null}
      </Glass>
      <Section title="Milestones" action="Add" onAction={() => ui.form({ title: "Milestone", fields: [{ key: "title", label: "Title", type: "text", required: true }, { key: "due", label: "Due", type: "date" }], onSubmit: (v) => { db.update("projects", p.id, { milestones: [...ms, { id: Date.now().toString(36), done: false, ...v }] }); } })}>
        <Glass>{ms.length ? ms.map((m: any) => <Row key={m.id} title={m.title} subtitle={m.due ? (new Date(m.due) < new Date() && !m.done ? "⚠ overdue " : "") + fmtDay(m.due) : undefined} done={m.done} strike left={<Check label={m.title} on={m.done} onPress={() => db.update("projects", p.id, { milestones: ms.map((x: any) => (x.id === m.id ? { ...x, done: !x.done } : x)) })} />} />) : <T muted>No milestones.</T>}</Glass>
      </Section>
      <Section title="Timeline & tasks" action="Add task" onAction={addTask} testID="project-tasks">
        <Glass>{ts.length ? [...ts].sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9")).map((t, i) => (
          <View key={t.id}>{i ? <Divider /> : null}
            <Row title={t.title} done={t.status === "done"} strike subtitle={[t.due ? fmtDay(t.due) : "no date", t.estMin ? durLabel(t.estMin) : null, depsOpen(t).length ? `🔒 after "${depsOpen(t)[0].title}"` : null].filter(Boolean).join(" · ")}
              left={<Check testID={`project-task-${t.id}`} label={t.title} on={t.status === "done"} onPress={() => completeTask(t)} />}
              onPress={() => ui.form({ title: "Edit task", fields: taskFields(), initial: t, onSubmit: (v) => saveTask(v, t) })} />
          </View>)) : <T muted>No tasks yet.</T>}</Glass>
      </Section>
      <Section title="Project notes" action="New note" onAction={() => { const n = db.add("notes", { title: `${p.title} notes`, body: "", projectId: p.id, folder: p.title, tags: [] }); router.push(`/note/${n.id}` as any); }}>
        <Glass>{notes.filter((n) => n.projectId === p.id).map((n) => <Row key={n.id} title={n.title} onPress={() => router.push(`/note/${n.id}` as any)} />)}{!notes.some((n) => n.projectId === p.id) ? <T muted>No notes linked.</T> : null}</Glass>
      </Section>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Btn small kind="secondary" label={p.pinned ? "Unpin" : "Pin to Today"} onPress={() => db.update("projects", p.id, { pinned: !p.pinned })} />
        <Btn small kind="secondary" label="Save as template" testID="project-save-template" onPress={() => { db.add("templates", { kind: "project", name: p.title, data: { tasks: ts.map((t) => ({ title: t.title, estMin: t.estMin })) } }); ui.toast("Template saved"); }} />
        <Btn small label={p.status === "done" ? "Reopen" : "Complete project"} testID="project-complete-button" onPress={() => {
          if (p.status === "done") return db.update("projects", p.id, { status: "active" });
          db.update("projects", p.id, { status: "done", completedAt: new Date().toISOString() });
          const summary = `Project "${p.title}" completed ${fmtDay(new Date())}.\nTasks done: ${done.length}/${ts.length}\nMilestones: ${ms.filter((m: any) => m.done).length}/${ms.length}\nTime logged: ${durLabel(ts.reduce((a, t) => a + (t.actualMin || 0), 0))} actual vs ${durLabel(ts.reduce((a, t) => a + (t.estMin || 0), 0))} estimated\nOpen items: ${remaining.map((t) => t.title).join(", ") || "none"}`;
          const n = db.add("notes", { title: `${p.title} — completion summary`, body: summary, projectId: p.id, folder: "Reviews", tags: ["summary"] });
          ui.toast("Completion summary saved to notes"); router.push(`/note/${n.id}` as any);
        }} />
      </View>
      {db.list("templates").filter((t) => t.kind === "project").length ? <T v="caption" muted style={{ color: colors.muted }}>Saved project templates: {db.list("templates").filter((t) => t.kind === "project").map((t) => t.name).join(", ")}</T> : null}
    </Screen>
  );
}
