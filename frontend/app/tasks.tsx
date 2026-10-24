import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { endOfDay } from "date-fns";
import { db, Item, useCol } from "@/src/store/db";
import { radius, spacing, type, useTheme } from "@/src/theme";
import { depsOpen, taskScore } from "@/src/engine/planner";
import { durLabel, fmtDT } from "@/src/engine/time";
import { Badge, Btn, Check, ChipRow, Divider, Empty, Fab, Glass, IconBtn, Row, Screen, T, Chip } from "@/src/ui/kit";
import { completeTask, saveTask, taskFields } from "@/src/ui/forms";
import { useUI } from "@/src/ui/overlay";
import { cancelReminder } from "@/src/engine/notify";

type L = "today" | "upcoming" | "overdue" | "someday" | "all" | "done" | "archived" | "trash";

export function openTaskEditor(ui: ReturnType<typeof useUI>, t?: Item) {
  ui.form({ title: t ? "Edit task" : "New task", fields: taskFields(), initial: t, onSubmit: (v) => saveTask(v, t), onDelete: t ? () => { cancelReminder(t.notifId); db.remove("tasks", t.id); ui.toast("Moved to trash", () => db.undo()); } : undefined });
}

export default function Tasks() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const ui = useUI();
  const params = useLocalSearchParams<{ project?: string }>();
  const all = useCol("tasks");
  const raw = db.get().data.tasks;
  const [list, setList] = useState<L>("today");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"smart" | "due" | "priority" | "title">("smart");
  const [sel, setSel] = useState<string[]>([]);
  const [limit, setLimit] = useState(60); // render in pages for large lists
  const now = new Date();
  const items = useMemo(() => {
    let xs: Item[] = list === "trash" ? raw.filter((t) => t.deleted) : all;
    if (params.project) xs = xs.filter((t) => t.projectId === params.project);
    xs = xs.filter((t) => {
      const open = t.status !== "done" && !t.archived;
      switch (list) {
        case "today": return open && !t.someday && (!t.due || new Date(t.due) <= endOfDay(now));
        case "upcoming": return open && t.due && new Date(t.due) > endOfDay(now);
        case "overdue": return open && t.due && new Date(t.due) < now;
        case "someday": return open && t.someday;
        case "done": return t.status === "done" && !t.archived;
        case "archived": return t.archived;
        case "trash": return true;
        default: return !t.archived;
      }
    });
    if (q) { const s = q.toLowerCase(); xs = xs.filter((t) => (t.title + " " + (t.notes ?? "") + " " + (t.tags ?? []).join(" ")).toLowerCase().includes(s)); }
    const scores = new Map(sort === "smart" ? xs.map((t) => [t.id, taskScore(t).score]) : []);
    const by = { smart: (a: Item, b: Item) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0), due: (a: Item, b: Item) => (a.due ?? "9").localeCompare(b.due ?? "9"), priority: (a: Item, b: Item) => (a.priority ?? 3) - (b.priority ?? 3), title: (a: Item, b: Item) => a.title.localeCompare(b.title) };
    return [...xs].sort(by[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, raw, list, q, sort, params.project]);

  const bulk = async (op: "done" | "archive" | "delete" | "restore") => {
    if (op === "delete" && !(await ui.confirm({ title: `Delete ${sel.length} task(s)?`, message: "They move to Trash and can be restored.", destructive: true, confirmLabel: "Delete" }))) return;
    db.replace("tasks", db.get().data.tasks.map((t) => sel.includes(t.id) ? { ...t, ...(op === "done" ? { status: "done", completedAt: new Date().toISOString() } : op === "archive" ? { archived: true } : op === "delete" ? { deleted: true } : { deleted: false, archived: false }), updatedAt: new Date().toISOString() } : t), `Bulk ${op}`);
    ui.toast(`${sel.length} task(s) updated`, () => db.undo()); setSel([]);
  };

  const detail = (t: Item) => ui.sheet(t.title, <TaskDetail id={t.id} />);

  return (
    <View style={{ flex: 1 }}>
      <Screen testID="tasks-screen" title="Tasks" subtitle={`${all.filter((t) => t.status !== "done").length} open · ${all.filter((t) => t.status !== "done" && t.due && new Date(t.due) < now).length} overdue`} bottomPad={insets.bottom + 100}
        right={<IconBtn testID="tasks-sort-button" label="Sort" icon="swap-vertical" onPress={() => setSort(sort === "smart" ? "due" : sort === "due" ? "priority" : sort === "priority" ? "title" : "smart")} />}
        header={<View>
          <TextInput testID="tasks-search-input" value={q} onChangeText={setQ} placeholder={`Search tasks · sort: ${sort}`} placeholderTextColor={colors.muted} style={[type.body, { height: 40, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 14, color: colors.onSurface, marginTop: 6 }]} />
          <ChipRow testID="tasks-list" value={list} onChange={(v) => { setList(v); setSel([]); }} options={(["today", "upcoming", "overdue", "someday", "all", "done", "archived", "trash"] as L[]).map((v) => ({ label: v[0].toUpperCase() + v.slice(1), value: v }))} />
          {sel.length ? <View style={{ flexDirection: "row", gap: 8, paddingBottom: 6, flexWrap: "wrap" }}>
            <T v="caption" style={{ alignSelf: "center" }}>{sel.length} selected</T>
            {list === "trash" || list === "archived" ? <Btn small label="Restore" testID="bulk-restore" onPress={() => bulk("restore")} /> : <><Btn small label="Done" testID="bulk-done" onPress={() => bulk("done")} /><Btn small kind="secondary" label="Archive" testID="bulk-archive" onPress={() => bulk("archive")} /><Btn small kind="danger" label="Delete" testID="bulk-delete" onPress={() => bulk("delete")} /></>}
            <Btn small kind="ghost" label="Clear" onPress={() => setSel([])} />
          </View> : null}
        </View>}>
        {items.length ? <Glass style={{ paddingVertical: 4 }}>{items.slice(0, limit).map((t, i) => {
          const blocked = depsOpen(t).length > 0;
          const subs = t.subtasks ?? [];
          return (
            <View key={t.id}>{i ? <Divider /> : null}
              <Row testID={`task-row-${t.id}`} done={t.status === "done"} strike title={t.title}
                subtitle={[t.due ? (new Date(t.due) < now && t.status !== "done" ? "⚠ overdue " : "due ") + fmtDT(t.due) : null, t.estMin ? durLabel(t.estMin) : null, subs.length ? `${subs.filter((s: any) => s.done).length}/${subs.length} subtasks` : null, blocked ? "🔒 blocked" : null, (t.tags ?? []).map((x: string) => "#" + x).join(" ") || null, t.recurrence && t.recurrence !== "none" ? "↻ " + t.recurrence : null].filter(Boolean).join(" · ")}
                left={list === "trash" ? undefined : <Check testID={`task-check-${t.id}`} label={`Toggle ${t.title}`} on={t.status === "done"} onPress={() => { const d = completeTask(t); ui.toast(d ? "Completed" : "Reopened", () => db.undo()); }} />}
                right={<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>{t.priority === 1 ? <Badge label="P1" tone="error" /> : t.priority === 2 ? <Badge label="P2" tone="warning" /> : null}<Chip testID={`task-select-${t.id}`} label={sel.includes(t.id) ? "✓" : "○"} active={sel.includes(t.id)} onPress={() => setSel(sel.includes(t.id) ? sel.filter((x) => x !== t.id) : [...sel, t.id])} /></View>}
                onPress={() => (list === "trash" ? db.restore("tasks", t.id) : detail(t))} onLongPress={() => setSel([...sel, t.id])} />
            </View>);
        })}</Glass> : <Empty testID="tasks-empty" icon="checkmark-done-outline" title={list === "trash" ? "Trash is empty" : "No tasks here"} body={list === "today" ? "Add a task or ask the Agent." : undefined} action={list !== "trash" ? "Add task" : undefined} onAction={() => openTaskEditor(ui)} />}
        {items.length > limit ? <Btn kind="secondary" testID="tasks-show-more" label={`Show more (${items.length - limit} left)`} onPress={() => setLimit(limit + 60)} /> : null}
        {list === "trash" && items.length ? <Btn kind="danger" label="Empty trash" testID="empty-trash-button" onPress={async () => { if (await ui.confirm({ title: "Empty trash?", message: "Permanently deletes these tasks. Undo is available right after.", destructive: true })) { db.replace("tasks", db.get().data.tasks.filter((t) => !t.deleted), "Empty trash"); ui.toast("Trash emptied", () => db.undo()); } }} /> : null}
      </Screen>
      <Fab testID="tasks-add-fab" bottom={insets.bottom + 16} onPress={() => openTaskEditor(ui)} />
    </View>
  );
}

function TaskDetail({ id }: { id: string }) {
  const ui = useUI(); const { colors } = useTheme();
  useCol("tasks");
  const t = db.find("tasks", id);
  const [sub, setSub] = useState("");
  if (!t) return <T>Task not found.</T>;
  const subs = t.subtasks ?? [];
  const deps = (t.dependsOn ?? []).map((d: string) => db.find("tasks", d)).filter(Boolean);
  const dependents = db.list("tasks").filter((x) => (x.dependsOn ?? []).includes(t.id));
  const s = taskScore(t);
  return (
    <View style={{ gap: 10 }} testID="task-detail">
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}><Badge label={"P" + (t.priority ?? 3)} /><Badge label={t.status} tone={t.status === "done" ? "success" : "muted"} />{t.due ? <Badge label={"due " + fmtDT(t.due)} tone="info" /> : null}{t.projectId ? <Badge label={db.find("projects", t.projectId)?.title ?? "project"} tone="muted" /> : null}</View>
      <T v="caption" muted>AI priority reasoning: {s.why.join(", ")} (score {Math.round(s.score)})</T>
      {t.notes ? <T>{t.notes}</T> : null}
      <T v="headline">Subtasks / checklist</T>
      {subs.map((x: any) => <Row key={x.id} title={x.title} done={x.done} strike left={<Check testID={`subtask-${x.id}`} label={x.title} on={x.done} onPress={() => db.update("tasks", t.id, { subtasks: subs.map((y: any) => (y.id === x.id ? { ...y, done: !y.done } : y)) })} />} right={<IconBtn label="Remove subtask" icon="close" onPress={() => db.update("tasks", t.id, { subtasks: subs.filter((y: any) => y.id !== x.id) })} />} />)}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput testID="subtask-input" value={sub} onChangeText={setSub} placeholder="Add subtask" placeholderTextColor={colors.muted} style={[type.body, { flex: 1, height: 44, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: 12, color: colors.onSurface }]} />
        <Btn small label="Add" testID="subtask-add-button" onPress={() => { if (!sub.trim()) return; db.update("tasks", t.id, { subtasks: [...subs, { id: Date.now().toString(36), title: sub.trim(), done: false }] }); setSub(""); }} />
      </View>
      {deps.length ? <T muted>Depends on: {deps.map((d: Item) => `${d.title}${d.status === "done" ? " ✓" : ""}`).join(", ")}</T> : null}
      {dependents.length ? <T muted>Blocks: {dependents.map((d) => d.title).join(", ")}</T> : null}
      {t.completedAt ? <T v="caption" muted>Completed {fmtDT(t.completedAt)}</T> : null}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Btn small label="Edit" icon="create-outline" testID="task-edit-button" onPress={() => { ui.closeSheet(); setTimeout(() => openTaskEditor(ui, t), 250); }} />
        <Btn small kind="secondary" label={t.pinned ? "Unpin" : "Pin to Today"} testID="task-pin-button" onPress={() => db.update("tasks", t.id, { pinned: !t.pinned })} />
        <Btn small kind="secondary" label="Duplicate" testID="task-duplicate-button" onPress={() => { const { id: _i, createdAt, updatedAt, ...rest } = t; db.add("tasks", { ...rest, title: t.title + " (copy)", status: "todo" }); ui.toast("Duplicated"); }} />
        <Btn small kind="secondary" label={t.archived ? "Unarchive" : "Archive"} testID="task-archive-button" onPress={() => { db.update("tasks", t.id, { archived: !t.archived }); ui.closeSheet(); }} />
        <Btn small kind="danger" label="Delete" testID="task-delete-button" onPress={() => { cancelReminder(t.notifId); db.remove("tasks", t.id); ui.closeSheet(); ui.toast("Moved to trash", () => db.undo()); }} />
      </View>
    </View>
  );
}
