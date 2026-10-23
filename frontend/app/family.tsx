import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDays, endOfDay, startOfDay } from "date-fns";
import { db, Item, useCol, useSettings } from "@/src/store/db";
import { useTheme } from "@/src/theme";
import { fmtDay, fmtTime } from "@/src/engine/time";
import { expandEvents } from "@/src/engine/planner";
import { scheduleReminder } from "@/src/engine/notify";
import { saveAndShare, toICS } from "@/src/engine/io";
import { Badge, Btn, Check, ChipRow, Divider, Glass, Row, Screen, T } from "@/src/ui/kit";
import { CollectionList } from "@/src/ui/collection";
import { useUI } from "@/src/ui/overlay";

const nextAnniv = (iso: string) => { const d = new Date(iso); const n = new Date(); const x = new Date(n.getFullYear(), d.getMonth(), d.getDate()); if (x < startOfDay(n)) x.setFullYear(n.getFullYear() + 1); return x; };

export default function Family() {
  const insets = useSafeAreaInsets(); const ui = useUI(); const { colors } = useTheme(); const st = useSettings();
  const [tab, setTab] = useState<"lists" | "dates" | "calendar" | "profiles">("lists");
  const [list, setList] = useState<"shopping" | "errands" | "household" | "chores">("shopping");
  const items = useCol("lists"); const dates = useCol("importantDates"); const profiles = useCol("profiles"); const events = useCol("events");
  const cur = items.filter((i) => i.list === list);
  const famEvents = expandEvents(events.filter((e) => e.calendarId === "family" || e.profileId), startOfDay(new Date()), endOfDay(addDays(new Date(), 14)));
  return (
    <Screen testID="family-screen" title="Family & Errands" subtitle="Shared on this device · no remote sync" bottomPad={insets.bottom + 40}
      header={<ChipRow testID="family-tab" value={tab} onChange={setTab} options={[{ label: "Lists", value: "lists" }, { label: "Important dates", value: "dates" }, { label: "Family calendar", value: "calendar" }, { label: "Profiles", value: "profiles" }]} />}>
      {tab === "lists" ? <>
        <ChipRow testID="family-list" value={list} onChange={setList} options={[{ label: "Shopping", value: "shopping" }, { label: "Errands", value: "errands" }, { label: "Household", value: "household" }, { label: "Chores", value: "chores" }]} />
        <Glass>{cur.map((i, n) => <View key={i.id}>{n ? <Divider /> : null}<Row testID={`list-item-${i.id}`} title={i.title} subtitle={[i.qty, i.assignee ? db.find("profiles", i.assignee)?.name : null, i.recurring ? "↻ " + i.recurring : null].filter(Boolean).join(" · ")} done={i.done} strike
          left={<Check testID={`list-check-${i.id}`} label={i.title} on={!!i.done} onPress={() => { db.update("lists", i.id, { done: !i.done, doneAt: new Date().toISOString() }); if (!i.done && i.recurring) setTimeout(() => db.update("lists", i.id, { done: false }, undefined, true), 0) ; }} />}
          onPress={() => ui.form({ title: "Edit item", initial: i, fields: [{ key: "title", label: "Item", type: "text", required: true }, { key: "qty", label: "Qty / note", type: "text" }, { key: "assignee", label: "Assigned to", type: "select", options: profiles.map((p) => ({ label: p.name, value: p.id })) }, { key: "recurring", label: "Recurring chore", type: "select", options: ["daily", "weekly", "monthly"].map((x) => ({ label: x, value: x })) }], onSubmit: (v) => { db.update("lists", i.id, v); }, onDelete: () => db.remove("lists", i.id) })} /></View>)}
          {!cur.length ? <T muted>Empty list.</T> : null}</Glass>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Btn testID="list-add" label="Add item" icon="add" onPress={() => ui.form({ title: `Add to ${list}`, fields: [{ key: "title", label: "Item", type: "text", required: true }, { key: "qty", label: "Qty / note", type: "text" }, { key: "assignee", label: "Assigned to", type: "select", options: profiles.map((p) => ({ label: p.name, value: p.id })) }, { key: "recurring", label: "Recurring", type: "select", options: ["daily", "weekly", "monthly"].map((x) => ({ label: x, value: x })) }], onSubmit: (v) => { if (cur.some((x) => x.title.toLowerCase() === v.title.toLowerCase() && !x.done)) return "Already on the list."; db.add("lists", { ...v, list }); } })} />
          <Btn kind="secondary" label="Clear done" onPress={() => { const done = cur.filter((i) => i.done && !i.recurring); db.replace("lists", db.get().data.lists.map((x) => (done.some((d) => d.id === x.id) ? { ...x, deleted: true } : x)), "Clear done"); ui.toast(`${done.length} cleared`, () => db.undo()); }} />
        </View>
      </> : null}
      {tab === "dates" ? <CollectionList testID="important-dates" col="importantDates" addLabel="Add important date" emptyTitle="No important dates" sort={(a, b) => nextAnniv(a.date).getTime() - nextAnniv(b.date).getTime()}
        fields={[{ key: "title", label: "Who / what", type: "text", required: true }, { key: "kind", label: "Type", type: "select", required: true, options: ["birthday", "anniversary", "follow-up", "other"].map((x) => ({ label: x, value: x })) }, { key: "date", label: "Date", type: "date", required: true }, { key: "remindDays", label: "Remind days before", type: "number" }]} defaults={{ kind: "birthday", remindDays: 1 }}
        title={(d) => `${d.title}`} subtitle={(d) => { const n = nextAnniv(d.date); const days = Math.round((n.getTime() - startOfDay(new Date()).getTime()) / 86400000); return `${d.kind} · ${fmtDay(n)} · in ${days}d`; }}
        right={(d) => { const days = Math.round((nextAnniv(d.date).getTime() - startOfDay(new Date()).getTime()) / 86400000); return days <= 7 ? <Badge label={days === 0 ? "today!" : `${days}d`} tone="warning" /> : undefined; }}
        onSaved={async (d) => { const at = nextAnniv(d.date); at.setDate(at.getDate() - (d.remindDays ?? 1)); at.setHours(9, 0, 0, 0); if (at > new Date()) await scheduleReminder(`${d.kind === "birthday" ? "🎂" : "📅"} ${d.title}`, at, { kind: "date", refId: d.id }); }} /> : null}
      {tab === "calendar" ? <>
        <T muted>Events in the Family calendar or assigned to a profile (next 14 days).</T>
        <Glass>{famEvents.map((e, i) => <View key={e.occKey}>{i ? <Divider /> : null}<Row title={e.title} subtitle={`${fmtDay(e.s)} ${e.allDay ? "all day" : fmtTime(e.s)}${e.profileId ? " · " + (db.find("profiles", e.profileId)?.name ?? "") : ""}`} /></View>)}{!famEvents.length ? <T muted>No family events.</T> : null}</Glass>
        <Btn kind="secondary" icon="share-outline" label="Export family schedule (.ics)" testID="family-export-ics" onPress={async () => { try { ui.toast(await saveAndShare("family.ics", toICS(events.filter((e) => e.calendarId === "family" || e.profileId)), "text/calendar")); } catch (e: any) { ui.toast(e.message); } }} />
      </> : null}
      {tab === "profiles" ? <>
        <T muted>Shared-device profiles. Switching profile changes who you're planning for; data stays on this device. Reports are only shared if you export them.</T>
        <CollectionList testID="profiles" col="profiles" addLabel="Add profile" emptyTitle="No profiles" defaults={{ role: "parent" }}
          fields={[{ key: "name", label: "Name", type: "text", required: true }, { key: "role", label: "Role", type: "select", required: true, options: ["parent", "student", "kid", "teacher", "other"].map((x) => ({ label: x, value: x })) }, { key: "shareReports", label: "Allow progress reports for this profile", type: "toggle" }]}
          title={(p) => p.name + (st.activeProfileId === p.id ? " (active)" : "")} subtitle={(p) => p.role + (p.shareReports ? " · reports allowed" : "")}
          right={(p: Item) => st.activeProfileId !== p.id ? <Btn small kind="secondary" label="Switch" onPress={() => { db.setSettings({ activeProfileId: p.id, kidsMode: p.role === "kid" }); ui.toast(`Active: ${p.name}`); }} /> : undefined} />
        <Btn kind="secondary" label="Export permitted progress reports" icon="document-outline" onPress={async () => {
          const allowed = profiles.filter((p) => p.shareReports);
          if (!allowed.length) return ui.toast("No profile has reports enabled.");
          const text = allowed.map((p) => `${p.name} (${p.role})\nTasks done (7d): ${db.list("tasks").filter((t) => t.status === "done" && t.completedAt && new Date(t.completedAt) > addDays(new Date(), -7)).length}\nKids stars (7d): ${db.list("kidsLog").filter((l) => new Date(l.date) > addDays(new Date(), -7)).reduce((a, l) => a + l.stars, 0)}\nStudy sessions (7d): ${db.list("studySessions").filter((s) => new Date(s.date) > addDays(new Date(), -7)).length}`).join("\n\n");
          try { ui.toast(await saveAndShare("family-report.txt", text + "\n\nGenerated locally by TIME AI.", "text/plain")); } catch (e: any) { ui.toast(e.message); }
        }} />
        <T v="caption" muted style={{ color: colors.muted }}>Set a parent PIN in Settings › Privacy to protect Kids Mode exit and app lock.</T>
      </> : null}
    </Screen>
  );
}
