import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDays, format, startOfDay } from "date-fns";
import { db, Item, useCol } from "@/src/store/db";
import { useTheme } from "@/src/theme";
import { fmtDay, todayKey } from "@/src/engine/time";
import { weeklyReview } from "@/src/engine/reports";
import { Badge, Btn, ChipRow, Divider, Glass, Icon, Progress, Row, Screen, Section, T, Chip } from "@/src/ui/kit";
import { CollectionList } from "@/src/ui/collection";
import { useUI } from "@/src/ui/overlay";

export default function LifeOS() {
  const insets = useSafeAreaInsets(); const ui = useUI(); const { colors } = useTheme();
  const [tab, setTab] = useState<"areas" | "checkin" | "reviews" | "commit" | "records">("areas");
  const areas = useCol("lifeAreas"); const goals = useCol("goals"); const tasks = useCol("tasks"); const notes = useCol("notes"); const projects = useCol("projects"); const routines = useCol("routines"); const checkins = useCol("checkins");
  const [area, setArea] = useState<string | null>(null);
  const tk = todayKey();
  const todayCheck = checkins.find((c) => c.date === tk && c.type === "daily");
  const areaView = (a: Item) => {
    const g = goals.filter((x) => x.areaId === a.id), t = tasks.filter((x) => x.areaId === a.id), n = notes.filter((x) => x.areaId === a.id), p = projects.filter((x) => x.areaId === a.id);
    return (
      <View style={{ gap: 10 }}>
        <Glass style={{ gap: 6 }}><T v="headline">Goals ({g.length})</T>{g.map((x) => <View key={x.id} style={{ gap: 4 }}><T>{x.title}</T><Progress value={(x.current ?? 0) / (x.target || 1)} /></View>)}<Btn small kind="secondary" label="Add goal" onPress={() => ui.form({ title: "Goal in " + a.name, fields: [{ key: "title", label: "Goal", type: "text", required: true }, { key: "target", label: "Target", type: "number", required: true }, { key: "unit", label: "Unit", type: "text" }, { key: "deadline", label: "Deadline", type: "date" }], onSubmit: (v) => { db.add("goals", { ...v, areaId: a.id, current: 0, milestones: [], term: "short" }); } })} /></Glass>
        <Glass><T v="headline">Tasks ({t.filter((x) => x.status !== "done").length} open)</T>{t.slice(0, 8).map((x) => <Row key={x.id} title={x.title} done={x.status === "done"} strike />)}<Btn small kind="secondary" label="Add task" onPress={() => ui.form({ title: "Task in " + a.name, fields: [{ key: "title", label: "Task", type: "text", required: true }, { key: "due", label: "Due", type: "datetime" }], onSubmit: (v) => { db.add("tasks", { ...v, areaId: a.id, status: "todo", priority: 3, subtasks: [], dependsOn: [], tags: [] }); } })} /></Glass>
        <Glass><T v="headline">Projects ({p.length}) & notes ({n.length})</T>{p.map((x) => <Row key={x.id} title={x.title} left={<Icon name="briefcase-outline" size={16} />} onPress={() => router.push(`/project/${x.id}` as any)} />)}{n.map((x) => <Row key={x.id} title={x.title} left={<Icon name="document-text-outline" size={16} />} onPress={() => router.push(`/note/${x.id}` as any)} />)}<Btn small kind="secondary" label="Add note" onPress={() => { const nn = db.add("notes", { title: a.name + " note", body: "", areaId: a.id, folder: a.name, tags: [] }); router.push(`/note/${nn.id}` as any); }} /></Glass>
        <T v="caption" muted>Link existing tasks, notes, goals and projects to this area from their edit screens ("Life area").</T>
      </View>);
  };
  return (
    <Screen testID="lifeos-screen" title="Life OS" subtitle={`${areas.length} life areas`} bottomPad={insets.bottom + 40}
      header={<ChipRow testID="lifeos-tab" value={tab} onChange={setTab} options={[{ label: "Areas", value: "areas" }, { label: "Check-in", value: "checkin" }, { label: "Reviews", value: "reviews" }, { label: "Commitments", value: "commit" }, { label: "Records", value: "records" }]} />}>
      {tab === "areas" ? <>
        {area ? <><Btn small kind="ghost" icon="chevron-back" label="All areas" onPress={() => setArea(null)} /><T v="title">{db.find("lifeAreas", area)?.name}</T>{areaView(db.find("lifeAreas", area)!)}</> : <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {areas.map((a) => { const g = goals.filter((x) => x.areaId === a.id); const t = tasks.filter((x) => x.areaId === a.id && x.status !== "done"); return (
              <Glass key={a.id} testID={`area-${a.id}`} onPress={() => setArea(a.id)} style={{ width: 160, flexGrow: 1, gap: 4 }}><T v="headline">{a.name}</T><T v="caption" muted>{g.length} goals · {t.length} open tasks</T></Glass>); })}
          </View>
          <Btn kind="secondary" icon="add" label="Custom life area" testID="area-add" onPress={() => ui.form({ title: "New life area", fields: [{ key: "name", label: "Name", type: "text", required: true }], onSubmit: (v) => { if (areas.some((a) => a.name.toLowerCase() === v.name.toLowerCase())) return "Area already exists."; db.add("lifeAreas", v); } })} />
        </>}
      </> : null}
      {tab === "checkin" ? <>
        <Glass style={{ gap: 10 }} testID="daily-checkin">
          <T v="headline">Daily check-in {todayCheck ? "✓" : ""}</T>
          {(["mood", "energy"] as const).map((k) => <View key={k} style={{ gap: 6 }}><T v="caption" muted>{k.toUpperCase()} (1–5, self-reported)</T><View style={{ flexDirection: "row", gap: 6 }}>{[1, 2, 3, 4, 5].map((n) => <Chip key={n} testID={`checkin-${k}-${n}`} label={String(n)} active={todayCheck?.[k] === n} onPress={() => todayCheck ? db.update("checkins", todayCheck.id, { [k]: n }) : db.add("checkins", { date: tk, type: "daily", [k]: n })} />)}</View></View>)}
          <Btn small kind="secondary" label={todayCheck?.note ? "Edit reflection" : "Add reflection"} onPress={() => ui.form({ title: "Reflection", initial: todayCheck, fields: [{ key: "note", label: "How did today go?", type: "multiline" }, { key: "gratitude", label: "Grateful for", type: "text" }], onSubmit: (v) => { if (todayCheck) db.update("checkins", todayCheck.id, v); else db.add("checkins", { date: tk, type: "daily", ...v }); } })} />
          <T v="caption" muted>Energy check-ins inform your own trends only; the planner uses the energy windows you set in Settings.</T>
        </Glass>
        <Section title="Last 14 days"><Glass>{Array.from({ length: 14 }, (_, i) => format(addDays(startOfDay(new Date()), -i), "yyyy-MM-dd")).map((d) => { const c = checkins.find((x) => x.date === d && x.type === "daily"); return c ? <Row key={d} title={fmtDay(d)} subtitle={`mood ${c.mood ?? "-"} · energy ${c.energy ?? "-"}${c.note ? " · " + c.note : ""}`} /> : null; })}</Glass></Section>
      </> : null}
      {tab === "reviews" ? <>
        <Btn testID="weekly-review-button" label="Generate weekly review" icon="sparkles-outline" onPress={() => { const r = weeklyReview(); ui.sheet("Weekly review", <View style={{ gap: 8 }}><T>{r}</T><Btn label="Save as note" onPress={() => { db.add("notes", { title: `Weekly review ${fmtDay(new Date())}`, body: r, folder: "Reviews", tags: ["review"] }); ui.closeSheet(); ui.toast("Saved to Notes › Reviews"); }} /></View>); }} />
        <Btn kind="secondary" label="Monthly review" onPress={() => ui.form({ title: `Monthly review — ${format(new Date(), "MMMM")}`, fields: [{ key: "wins", label: "Wins", type: "multiline" }, { key: "lessons", label: "Lessons", type: "multiline" }, { key: "next", label: "Focus next month", type: "multiline" }], onSubmit: (v) => { db.add("checkins", { date: tk, type: "monthly", ...v }); db.add("notes", { title: `Monthly review ${format(new Date(), "MMMM yyyy")}`, body: `Wins:\n${v.wins ?? ""}\n\nLessons:\n${v.lessons ?? ""}\n\nNext month:\n${v.next ?? ""}`, folder: "Reviews", tags: ["review"] }); } })} />
        <Glass>{notes.filter((n) => n.folder === "Reviews").map((n, i) => <View key={n.id}>{i ? <Divider /> : null}<Row title={n.title} onPress={() => router.push(`/note/${n.id}` as any)} /></View>)}{!notes.some((n) => n.folder === "Reviews") ? <T muted>No reviews saved.</T> : null}</Glass>
      </> : null}
      {tab === "commit" ? <>
        <T muted>Commitment tracker: promises to yourself or others.</T>
        <CollectionList testID="commitments" col="lists" filter={(i) => i.list === "commitment"} defaults={{ list: "commitment" }} addLabel="Add commitment" emptyTitle="No commitments"
          fields={[{ key: "title", label: "Commitment", type: "text", required: true }, { key: "to", label: "Made to", type: "text" }, { key: "due", label: "By", type: "date" }, { key: "done", label: "Kept", type: "toggle" }]}
          title={(i) => (i.done ? "✓ " : "") + i.title} subtitle={(i) => [i.to, i.due ? fmtDay(i.due) : null].filter(Boolean).join(" · ")} right={(i) => i.due && !i.done && new Date(i.due) < new Date() ? <Badge label="overdue" tone="warning" /> : undefined} />
      </> : null}
      {tab === "records" ? <>
        <T muted>Personal records & milestones (e.g. "Ran 10 km", "Passed driving test").</T>
        <CollectionList testID="records" col="lists" filter={(i) => i.list === "record"} defaults={{ list: "record" }} addLabel="Add record" emptyTitle="No records yet"
          fields={[{ key: "title", label: "Record", type: "text", required: true }, { key: "value", label: "Value", type: "text" }, { key: "date", label: "Date", type: "date" }, { key: "areaId", label: "Life area", type: "select", options: areas.map((a) => ({ label: a.name, value: a.id })) }]}
          title={(i) => i.title + (i.value ? `: ${i.value}` : "")} subtitle={(i) => (i.date ? fmtDay(i.date) : "") + (i.areaId ? " · " + (db.find("lifeAreas", i.areaId)?.name ?? "") : "")} />
      </> : null}
      {routines.length < 0 ? <T color={colors.muted}>.</T> : null}
    </Screen>
  );
}
