import { addDays, addMonths, endOfDay, endOfMonth, endOfWeek, endOfYear, format, isSameDay, startOfDay, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usesNativeTabs } from "@/src/navigation";
import { conflicts, expandEvents, freeSlots, Occ, openTasks, planTasks, suggestSlot, visibleEvents } from "@/src/engine/planner";
import { durLabel, fmtDay, fmtTime } from "@/src/engine/time";
import { fromICS, pickText, toICS, saveAndShare } from "@/src/engine/io";
import { enqueue, runQueued } from "@/src/engine/actions";
import { db, Item, useCol, useSettings } from "@/src/store/db";
import { radius, spacing, type, useTheme } from "@/src/theme";
import { Badge, Btn, Chip, ChipRow, Divider, Empty, Fab, Glass, IconBtn, Row, Screen, T } from "@/src/ui/kit";
import { eventFields, saveEvent } from "@/src/ui/forms";
import { useUI } from "@/src/ui/overlay";

type View_ = "day" | "week" | "month" | "year" | "agenda";

export default function Calendar() {
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { colors } = useTheme();
  const ui = useUI();
  const st = useSettings();
  const events = useCol("events"); const cals = useCol("calendars"); useCol("tasks");
  const [view, setView] = useState<View_>("day");
  const [cursor, setCursor] = useState(new Date());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const range = useMemo(() => {
    if (view === "day") return [startOfDay(cursor), endOfDay(cursor)];
    if (view === "week") return [startOfWeek(cursor, { weekStartsOn: st.weekStart }), endOfWeek(cursor, { weekStartsOn: st.weekStart })];
    if (view === "month") return [startOfMonth(cursor), endOfMonth(cursor)];
    if (view === "year") return [startOfYear(cursor), endOfYear(cursor)];
    return [startOfDay(cursor), endOfDay(addDays(cursor, 30))];
  }, [view, cursor, st.weekStart]);
  const occ = useMemo(() => expandEvents(visibleEvents(), range[0], range[1]).filter((e) => (cat === "all" || e.calendarId === cat) && (!q || (e.title + " " + (e.location ?? "") + " " + (e.description ?? "")).toLowerCase().includes(q.toLowerCase()))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, cals, range, q, cat]);
  const clashes = useMemo(() => conflicts(range[0], range[1]), [events, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = (n: number) => setCursor(view === "day" ? addDays(cursor, n) : view === "week" ? addDays(cursor, 7 * n) : view === "month" ? addMonths(cursor, n) : view === "year" ? addMonths(cursor, 12 * n) : addDays(cursor, 30 * n));
  const calColor = (id: string) => cals.find((c) => c.id === id)?.color ?? colors.brandPrimary;

  const newEvent = (start?: Date) => {
    const s = start ?? (() => { const d = new Date(cursor); d.setHours(new Date().getHours() + 1, 0, 0, 0); return d; })();
    const tpl = db.list("templates").filter((t) => t.kind === "event");
    ui.form({ title: "New event", fields: eventFields(), initial: { start: s.toISOString(), end: new Date(s.getTime() + 3600000).toISOString(), calendarId: "personal", recurrence: "none" }, onSubmit: (v) => saveEvent(v),
      extra: tpl.length ? <View style={{ gap: 6 }}><T v="caption" muted>From template</T><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{tpl.map((t) => <Chip key={t.id} label={t.name} onPress={() => { ui.closeForm(); const st2 = new Date(s); db.add("events", { ...t.data, start: st2.toISOString(), end: new Date(st2.getTime() + (t.data.lenMin ?? 60) * 60000).toISOString() }); ui.toast("Created from template", () => db.undo()); }} />)}</View></View> : undefined });
  };

  const openEvent = (o: Occ) => {
    const ev = db.find("events", o.id)!;
    const isRec = ev.recurrence && ev.recurrence !== "none";
    const edit = async () => {
      ui.closeSheet();
      let scope: "all" | "one" = "all";
      if (isRec) scope = (await ui.confirm({ title: "Edit recurring event", message: "Edit only this occurrence? (Cancel = edit all occurrences)", confirmLabel: "This one" })) ? "one" : "all";
      if (scope === "one") {
        ui.form({ title: "Edit occurrence", fields: eventFields(), initial: { ...ev, start: o.s.toISOString(), end: o.e.toISOString(), recurrence: "none" }, onSubmit: async (v) => { const r = await saveEvent({ ...v, recurrence: "none" }); if (r) return r; db.update("events", ev.id, { exceptions: [...(ev.exceptions ?? []), o.s.toISOString().slice(0, 10)] }); } });
      } else ui.form({ title: "Edit event", fields: eventFields(), initial: ev, onSubmit: (v) => saveEvent(v, ev), onDelete: () => { db.remove("events", ev.id); ui.toast("Event deleted", () => db.undo()); } });
    };
    const move = (min: number) => {
      if (ev.locked) return ui.toast("Protected event — unlock to move");
      db.update("events", ev.id, { start: new Date(new Date(ev.start).getTime() + min * 60000).toISOString(), end: new Date(new Date(ev.end).getTime() + min * 60000).toISOString() }, "Reschedule event");
      ui.closeSheet(); ui.toast(`Moved ${min > 0 ? "+" : ""}${min >= 1440 || min <= -1440 ? min / 1440 + "d" : min + "m"}`, () => db.undo());
    };
    ui.sheet(ev.title, (
      <View style={{ gap: 10 }} testID="event-detail">
        <T>{o.allDay ? "All day · " + fmtDay(o.s) : `${fmtDay(o.s)} · ${fmtTime(o.s)}–${fmtTime(o.e)}`}</T>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}><Badge label={cals.find((c) => c.id === ev.calendarId)?.name ?? "Personal"} />{ev.category ? <Badge label={ev.category} tone="muted" /> : null}{isRec ? <Badge label={"repeats " + ev.recurrence} tone="info" /> : null}{ev.locked ? <Badge label="protected" tone="warning" /> : null}<Badge label={"P" + (ev.priority ?? 3)} tone="muted" /></View>
        {ev.location ? <T muted>📍 {ev.location}{ev.travelMin ? ` · ${ev.travelMin}m travel` : ""}</T> : null}
        {ev.tz ? <T v="caption" muted>Time zone: {ev.tz} (shown in device local time)</T> : null}
        {ev.description ? <T muted>{ev.description}</T> : null}
        <T v="caption" muted>Reschedule (drag alternative)</T>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{[[-60, "-1h"], [-15, "-15m"], [15, "+15m"], [60, "+1h"], [1440, "+1 day"]].map(([m, l]) => <Chip key={l as string} testID={`event-move-${l}`} label={l as string} onPress={() => move(m as number)} />)}</View>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Btn small testID="event-edit-button" label="Edit" icon="create-outline" onPress={edit} />
          <Btn small kind="secondary" testID="event-duplicate-button" label="Duplicate" icon="copy-outline" onPress={() => { const { id, createdAt, updatedAt, ...rest } = ev; db.add("events", { ...rest, title: ev.title + " (copy)" }, "Duplicate event"); ui.closeSheet(); ui.toast("Duplicated", () => db.undo()); }} />
          <Btn small kind="secondary" testID="event-template-button" label="Save template" icon="bookmark-outline" onPress={() => { const { id, createdAt, updatedAt, start, end, ...rest } = ev; db.add("templates", { kind: "event", name: ev.title, data: { ...rest, lenMin: (new Date(end).getTime() - new Date(start).getTime()) / 60000 } }); ui.toast("Saved as template"); }} />
          <Btn small kind="secondary" testID="event-lock-button" label={ev.locked ? "Unprotect" : "Protect"} icon="lock-closed-outline" onPress={() => { db.update("events", ev.id, { locked: !ev.locked }); ui.closeSheet(); }} />
          <Btn small kind="danger" testID="event-delete-button" label="Delete" icon="trash-outline" onPress={async () => { ui.closeSheet(); if (isRec && (await ui.confirm({ title: "Delete recurring event", message: "Delete only this occurrence? (Cancel = choose all)", confirmLabel: "This one" }))) { db.update("events", ev.id, { exceptions: [...(ev.exceptions ?? []), o.s.toISOString().slice(0, 10)] }, "Delete occurrence"); ui.toast("Occurrence removed", () => db.undo()); return; } if (await ui.confirm({ title: "Delete event?", message: `"${ev.title}"${isRec ? " and all occurrences" : ""} will be deleted. You can undo.`, destructive: true, confirmLabel: "Delete" })) { db.remove("events", ev.id); ui.toast("Event deleted", () => db.undo()); } }} />
        </View>
      </View>
    ));
  };

  const previewPlan = () => {
    const tasks = openTasks().filter((t) => !t.someday && !t.scheduledEventId);
    const r = planTasks(tasks, view === "day" ? [startOfDay(cursor)] : Array.from({ length: 7 }, (_, i) => addDays(startOfDay(cursor), i)), st);
    ui.sheet("Alternative schedule preview", (
      <View style={{ gap: 8 }} testID="plan-preview">
        <T muted>Preview only — your calendar is unchanged until you approve. Protected events are never moved.</T>
        {r.blocks.map((b, i) => <Row key={i} title={`${fmtDay(b.start)} ${fmtTime(b.start)}–${fmtTime(b.end)} · ${b.title}`} subtitle={b.why} />)}
        {r.unscheduled.map((u, i) => <Row key={"u" + i} title={`Not placed: ${u.title}`} subtitle={u.reason} />)}
        {r.notes.map((n, i) => <T key={i} v="caption" muted>{n}</T>)}
        {!r.blocks.length && !r.unscheduled.length ? <T>No open tasks to plan.</T> : null}
        {r.blocks.length ? <Btn testID="plan-approve-button" label={`Approve ${r.blocks.length} block(s)`} onPress={async () => {
          const [q1] = enqueue([{ kind: "create_events_bulk", label: `Planner: ${r.blocks.length} time blocks`, payload: { events: r.blocks.map((b) => ({ title: b.title, start: b.start.toISOString(), end: b.end.toISOString(), taskId: b.taskId, calendarId: "personal", category: "Focus", description: "Planned: " + b.why })) } }], "calendar");
          if (q1) { const res = await runQueued(q1.id); ui.toast(res.status === "completed" ? "Plan applied" : "Failed: " + res.error, res.status === "completed" ? () => db.undo() : undefined); }
          r.blocks.forEach((b) => b.taskId && db.update("tasks", b.taskId, { scheduledEventId: "planned", start: b.start.toISOString() }, undefined, true));
          ui.closeSheet();
        }} /> : null}
      </View>));
  };

  const moreMenu = () => ui.sheet("Calendar tools", (
    <View style={{ gap: 10 }}>
      <Btn kind="secondary" icon="sparkles-outline" label="Preview smart plan" testID="cal-plan-button" onPress={() => { ui.closeSheet(); setTimeout(previewPlan, 300); }} />
      <Btn kind="secondary" icon="share-outline" label="Export .ics" testID="cal-export-button" onPress={async () => { try { ui.toast(await saveAndShare("timeai-calendar.ics", toICS(db.list("events")), "text/calendar")); } catch (e: any) { ui.toast("Export failed: " + e.message); } }} />
      <Btn kind="secondary" icon="download-outline" label="Import .ics" testID="cal-import-button" onPress={async () => {
        try { const f = await pickText(); if (!f) return; const evs = fromICS(f.text); const existing = new Set(db.list("events").map((e) => e.importUid ?? e.id + "@timeai")); const fresh = evs.filter((e) => !existing.has(e.importUid)); db.addMany("events", fresh, "Import calendar"); ui.closeSheet(); ui.toast(`Imported ${fresh.length} event(s)${evs.length - fresh.length ? `, ${evs.length - fresh.length} duplicate(s) skipped` : ""}`, () => db.undo()); }
        catch (e: any) { ui.toast("Import failed: " + e.message); }
      }} />
      <T v="headline">Calendars</T>
      {cals.map((c) => <Row key={c.id} title={c.name} left={<View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c.color }} />} right={<Chip testID={`cal-toggle-${c.id}`} label={c.visible === false ? "Hidden" : "Shown"} active={c.visible !== false} onPress={() => db.update("calendars", c.id, { visible: c.visible === false })} />} />)}
      <Btn kind="ghost" icon="add" label="New calendar" testID="cal-new-calendar" onPress={() => { ui.closeSheet(); ui.form({ title: "New calendar", fields: [{ key: "name", label: "Name", type: "text", required: true }, { key: "color", label: "Color", type: "select", options: ["#FF5E00", "#0A6CFF", "#1F9D55", "#AF52DE", "#FF2D55", "#C77700"].map((c) => ({ label: c, value: c })) }], onSubmit: (v) => { db.add("calendars", { ...v, color: v.color || "#FF5E00", visible: true }); } }); }} />
    </View>));

  const summary = (() => {
    const timed = occ.filter((e) => !e.allDay);
    const mins = timed.reduce((a, e) => a + (e.e.getTime() - e.s.getTime()) / 60000, 0);
    return `${occ.length} event(s) · ${durLabel(mins)} booked`;
  })();

  const dayBody = (d: Date, list: Occ[]) => {
    const free = freeSlots(d, st);
    return (
      <Glass style={{ gap: 2 }}>
        {list.length ? list.map((e, i) => (
          <View key={e.occKey}>{i ? <Divider /> : null}
            <Row testID={`cal-event-${e.id}`} title={e.title} subtitle={`${e.allDay ? "All day" : `${fmtTime(e.s)}–${fmtTime(e.e)}`}${e.location ? " · " + e.location : ""}${e.recurrence && e.recurrence !== "none" ? " · ↻" : ""}`} left={<View style={{ width: 4, height: 34, borderRadius: 2, backgroundColor: calColor(e.calendarId) }} />} right={e.locked ? <Badge label="locked" tone="warning" /> : undefined} onPress={() => openEvent(e)} />
          </View>)) : <T muted>No events.</T>}
        {free.length ? <T v="caption" muted style={{ marginTop: 8 }}>Free: {free.map((f) => `${fmtTime(f.s)}–${fmtTime(f.e)}`).join(", ")}</T> : null}
      </Glass>
    );
  };

  const grid = (month: Date, mini = false) => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: st.weekStart });
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    const counts = new Map<string, number>();
    if (!mini || occ.length) for (const e of expandEvents(visibleEvents(), start, addDays(start, 42))) { const k = format(e.s, "yyyy-MM-dd"); counts.set(k, (counts.get(k) ?? 0) + 1); }
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {!mini ? Array.from({ length: 7 }, (_, i) => <View key={i} style={{ width: "14.28%", alignItems: "center", paddingVertical: 4 }}><T v="caption" muted>{format(addDays(start, i), "EEEEE")}</T></View>) : null}
        {days.map((d) => {
          const n = counts.get(format(d, "yyyy-MM-dd")) ?? 0;
          const inMonth = d.getMonth() === month.getMonth();
          const sel = isSameDay(d, cursor); const today = isSameDay(d, new Date());
          if (mini) return (
            <View key={d.toISOString()} style={{ width: "14.28%", height: 18, alignItems: "center", justifyContent: "center", backgroundColor: today ? colors.brandTertiary : "transparent", borderRadius: 8 }}>
              <Text style={{ fontSize: 9, color: inMonth ? (n ? colors.brandPrimary : colors.onSurface) : "transparent", fontWeight: n ? "700" : "400" }}>{format(d, "d")}</Text>
            </View>);
          return (
            <Pressable key={d.toISOString()} testID={mini ? undefined : `cal-day-${format(d, "yyyy-MM-dd")}`} onPress={() => { setCursor(d); setView("day"); }} style={{ width: "14.28%", height: mini ? 18 : 46, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: mini ? 16 : 34, height: mini ? 16 : 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: sel && !mini ? colors.brandPrimary : today ? colors.brandTertiary : "transparent" }}>
                <T v={mini ? "caption" : "body"} style={mini ? { fontSize: 9 } : undefined} color={sel && !mini ? colors.onBrandPrimary : inMonth ? undefined : colors.muted}>{inMonth || !mini ? format(d, "d") : ""}</T>
              </View>
              {n && !mini ? <View style={{ flexDirection: "row", gap: 2, position: "absolute", bottom: 2 }}>{Array.from({ length: Math.min(3, n) }, (_, i) => <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.brandPrimary }} />)}</View> : null}
            </Pressable>);
        })}
      </View>
    );
  };

  const title = view === "year" ? format(cursor, "yyyy") : view === "month" ? format(cursor, "MMMM yyyy") : view === "week" ? `Week of ${format(range[0], "d MMM")}` : view === "agenda" ? "Agenda" : format(cursor, "EEE d MMM");
  return (
    <View style={{ flex: 1 }}>
      <Screen testID="calendar-screen" back={false} title={title} subtitle={summary} bottomPad={bottomChrome + 100}
        right={<><IconBtn testID="cal-today-button" label="Today" icon="today-outline" onPress={() => setCursor(new Date())} /><IconBtn testID="cal-tools-button" label="Calendar tools" icon="ellipsis-horizontal" onPress={moreMenu} /></>}
        header={<View>
          <ChipRow testID="cal-view" value={view} onChange={setView} options={[{ label: "Day", value: "day" }, { label: "Week", value: "week" }, { label: "Month", value: "month" }, { label: "Year", value: "year" }, { label: "Agenda", value: "agenda" }]} />
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <IconBtn testID="cal-prev-button" label="Previous" icon="chevron-back" onPress={() => step(-1)} />
            <TextInput testID="cal-search-input" value={q} onChangeText={setQ} placeholder="Search events" placeholderTextColor={colors.muted} style={[type.body, { flex: 1, height: 40, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 14, color: colors.onSurface }]} />
            <IconBtn testID="cal-next-button" label="Next" icon="chevron-forward" onPress={() => step(1)} />
          </View>
          <ChipRow testID="cal-filter" value={cat} onChange={setCat} options={[{ label: "All", value: "all" }, ...cals.map((c) => ({ label: c.name, value: c.id }))]} />
        </View>}>
        {clashes.length ? (
          <Glass testID="conflict-banner" style={{ borderColor: colors.warning, gap: 6 }}>
            <T v="headline" color={colors.warning}>⚠ {clashes.length} conflict(s)</T>
            {clashes.slice(0, 3).map((c, i) => { const s = suggestSlot(c.b.s, (c.b.e.getTime() - c.b.s.getTime()) / 60000, st); return (
              <View key={i} style={{ gap: 4 }}>
                <T v="caption">"{c.a.title}" overlaps "{c.b.title}" ({fmtDay(c.a.s)} {fmtTime(c.b.s)})</T>
                {s && !c.b.locked && (c.b.recurrence ?? "none") === "none" ? <Btn small kind="secondary" testID={`conflict-resolve-${i}`} label={`Move "${c.b.title}" to ${fmtDay(s.s)} ${fmtTime(s.s)}`} onPress={() => { const len = c.b.e.getTime() - c.b.s.getTime(); db.update("events", c.b.id, { start: s.s.toISOString(), end: new Date(s.s.getTime() + len).toISOString() }, "Resolve conflict"); ui.toast("Moved to free slot", () => db.undo()); }} /> : <T v="caption" muted>{c.b.locked ? "Protected event — resolve manually." : "Recurring or no free slot — edit manually."}</T>}
              </View>); })}
          </Glass>) : null}
        {view === "day" ? dayBody(cursor, occ) : null}
        {view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(range[0], i)).map((d) => (
          <View key={d.toISOString()} style={{ gap: 6 }}><T v="headline" color={isSameDay(d, new Date()) ? colors.brandPrimary : undefined}>{format(d, "EEEE d")}</T>{dayBody(d, occ.filter((e) => isSameDay(e.s, d)))}</View>)) : null}
        {view === "month" ? <><Glass>{grid(cursor)}</Glass><T v="headline">{format(cursor, "MMMM")} summary</T><T muted>{summary}</T></> : null}
        {view === "year" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Array.from({ length: 12 }, (_, m) => new Date(cursor.getFullYear(), m, 1)).map((mo) => (
              <Pressable key={mo.getMonth()} testID={`cal-year-month-${mo.getMonth()}`} onPress={() => { setCursor(mo); setView("month"); }} style={{ width: "31%", flexGrow: 1 }}>
                <Glass style={{ padding: 8 }}><T v="caption" style={{ fontWeight: "700", marginBottom: 4 }}>{format(mo, "MMM")} · {occ.filter((e) => e.s.getMonth() === mo.getMonth()).length}</T>{grid(mo, true)}</Glass>
              </Pressable>))}
          </View>) : null}
        {view === "agenda" ? (occ.length ? occ.map((e) => (
          <Glass key={e.occKey} onPress={() => openEvent(e)} testID={`agenda-${e.occKey}`} style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 12 }}>
            <View style={{ width: 52, alignItems: "center" }}><T v="caption" muted>{format(e.s, "EEE")}</T><T v="title">{format(e.s, "d")}</T></View>
            <View style={{ flex: 1 }}><T v="headline">{e.title}</T><T v="caption" muted>{e.allDay ? "All day" : `${fmtTime(e.s)}–${fmtTime(e.e)}`} · {cals.find((c) => c.id === e.calendarId)?.name}</T></View>
          </Glass>)) : <Empty testID="agenda-empty" title="Nothing in the next 30 days" action="Add event" onAction={() => newEvent()} />) : null}
      </Screen>
      <Fab testID="cal-add-event-fab" bottom={bottomChrome + 16} onPress={() => newEvent()} />
    </View>
  );
}
