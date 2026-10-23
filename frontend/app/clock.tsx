import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, useCol, useSettings } from "@/src/store/db";
import { spacing, useTheme } from "@/src/theme";
import { cancelMany, permState, requestPerm, openSettings, scheduleAlarm, scheduleReminder } from "@/src/engine/notify";
import { durLabel, fmtDT, todayKey } from "@/src/engine/time";
import { Btn, Chip, ChipRow, Divider, Empty, Glass, IconBtn, Row, Screen, T, Badge } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

const ZONES = ["UTC", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Sao_Paulo", "Africa/Lagos"];
const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
const fmtMs = (ms: number, cs = false) => { const s = ms / 1000; return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}${cs ? "." + pad((ms % 1000) / 10) : ""}`; };
function useTick(ms: number, on = true) { const [, s] = useState(0); useEffect(() => { if (!on) return; const i = setInterval(() => s((x) => x + 1), ms); return () => clearInterval(i); }, [ms, on]); }

// Timers are timestamp-based, so they stay correct after backgrounding.
function Big({ children, testID }: { children: string; testID?: string }) { const { colors } = useTheme(); return <Text testID={testID} accessibilityLiveRegion="polite" style={{ fontSize: 56, fontWeight: "200", color: colors.onSurface, fontVariant: ["tabular-nums"], textAlign: "center" }}>{children}</Text>; }

export default function Clock() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets(); const ui = useUI(); const { colors } = useTheme(); const st = useSettings();
  const [tab, setTab] = useState<string>(params.tab ?? "clock");
  const alarms = useCol("alarms"); const zones = useCol("worldClocks"); const sessions = useCol("focusSessions"); const logs = useCol("timeLogs");
  useTick(tab === "stopwatch" ? 50 : 1000);
  const now = new Date();
  // timer
  const [tEnd, setTEnd] = useState<number | null>(null); const [tLeft, setTLeft] = useState(0); const [tDur, setTDur] = useState(5 * 60000); const [tNotif, setTNotif] = useState<string | null>(null);
  const tRemain = tEnd ? Math.max(0, tEnd - Date.now()) : tLeft || tDur;
  useEffect(() => { if (tEnd && tRemain === 0) { setTEnd(null); setTLeft(0); ui.toast("⏰ Timer finished"); } }, [tEnd, tRemain, ui]);
  // stopwatch
  const [swStart, setSwStart] = useState<number | null>(null); const [swAcc, setSwAcc] = useState(0); const [laps, setLaps] = useState<number[]>([]);
  const swTime = swAcc + (swStart ? Date.now() - swStart : 0);
  // focus
  const [fMode, setFMode] = useState<"work" | "break">("work"); const [fEnd, setFEnd] = useState<number | null>(null); const [fStart, setFStart] = useState<number | null>(null); const [fMin, setFMin] = useState(st.pomodoroWork); const [fKind, setFKind] = useState<"study" | "work">("study"); const [interrupts, setInterrupts] = useState(0); const [fCount, setFCount] = useState(0);
  const fRemain = fEnd ? Math.max(0, fEnd - Date.now()) : fMin * 60000;
  const fNotif = useRef<string | null>(null);
  const finishFocus = (early = false) => {
    if (fStart && fMode === "work") {
      const mins = Math.round((Date.now() - fStart) / 60000);
      if (mins >= 1) db.add("focusSessions", { kind: fKind, minutes: mins, plannedMin: fMin, start: new Date(fStart).toISOString(), end: new Date().toISOString(), interruptions: interrupts, completed: !early });
      setFCount((c) => c + 1);
    }
    if (fNotif.current) cancelMany([fNotif.current]);
    setFEnd(null); setFStart(null); setInterrupts(0);
  };
  useEffect(() => {
    if (fEnd && fRemain === 0) {
      finishFocus();
      const next = fMode === "work" ? "break" : "work"; setFMode(next);
      const longBreak = next === "break" && (fCount + 1) % 4 === 0;
      setFMin(next === "work" ? st.pomodoroWork : longBreak ? st.pomodoroBreak * 3 : st.pomodoroBreak);
      ui.toast(next === "break" ? `Session done — take a ${longBreak ? "long " : ""}break` : "Break over — ready to focus");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fEnd, fRemain]);
  useEffect(() => { const s = AppState.addEventListener("change", () => {}); return () => s.remove(); }, []);

  const startFocus = async () => {
    const end = Date.now() + fMin * 60000; setFEnd(end); setFStart(Date.now());
    const r = await scheduleReminder(fMode === "work" ? "Focus session complete" : "Break is over", new Date(end), { kind: "focus", priority: "high" });
    fNotif.current = r.notifId;
  };
  const ensurePerm = async () => {
    const p = await permState();
    if (p === "granted" || p === "unsupported") return p;
    if (p === "blocked") { if (await ui.confirm({ title: "Notifications are blocked", message: "Alarms need notification permission. Open system settings to allow it.", confirmLabel: "Open Settings" })) openSettings(); return p; }
    if (await ui.confirm({ title: "Allow notifications?", message: "TIME AI uses local notifications to ring alarms and reminders. Nothing is sent online.", confirmLabel: "Continue" })) return requestPerm();
    return p;
  };
  const alarmForm = (a?: any) => ui.form({ title: a ? "Edit alarm" : "New alarm", initial: a ?? { time: "07:00", enabled: true, days: [] }, fields: [{ key: "time", label: "Time", type: "time", required: true }, { key: "label", label: "Label", type: "text" }, { key: "days", label: "Repeat (none = every day)", type: "multiselect", options: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => ({ label: d, value: i })) }, { key: "snoozeMin", label: "Snooze minutes", type: "number" }],
    onSubmit: async (v) => {
      const p = await ensurePerm();
      if (a?.notifIds) await cancelMany(a.notifIds);
      const r = await scheduleAlarm(v.label || "Alarm", v.time, v.days ?? []);
      const data = { ...v, label: v.label || "Alarm", enabled: true, notifIds: r.ids, error: r.error ?? (p === "unsupported" ? "System alarms unavailable here" : null) };
      if (a) db.update("alarms", a.id, data); else db.add("alarms", data);
      ui.toast(r.error ? "Saved, but: " + r.error : "Alarm scheduled");
    }, onDelete: a ? async () => { await cancelMany(a.notifIds); db.remove("alarms", a.id); } : undefined });

  const today = sessions.filter((s) => s.start?.slice(0, 10) === todayKey());
  return (
    <Screen testID="clock-screen" title="Clock & Focus" subtitle={now.toLocaleDateString()} bottomPad={insets.bottom + 40}
      header={<ChipRow testID="clock-tab" value={tab} onChange={setTab} options={[{ label: "Clock", value: "clock" }, { label: "World", value: "world" }, { label: "Alarms", value: "alarms" }, { label: "Timer", value: "timer" }, { label: "Stopwatch", value: "stopwatch" }, { label: "Focus", value: "focus" }, { label: "Time log", value: "log" }]} />}>
      {tab === "clock" ? <Glass style={{ alignItems: "center", gap: 4, paddingVertical: spacing.xxl }}><Big testID="digital-clock">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</Big><T muted>{now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</T></Glass> : null}

      {tab === "world" ? <>
        <Glass>{zones.length ? zones.map((z, i) => <View key={z.id}>{i ? <Divider /> : null}<Row title={z.tz.split("/").pop()!.replace("_", " ")} subtitle={z.tz} right={<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><T v="title">{now.toLocaleTimeString([], { timeZone: z.tz, hour: "2-digit", minute: "2-digit" })}</T><IconBtn label="Remove" icon="close" onPress={() => db.remove("worldClocks", z.id)} /></View>} /></View>) : <T muted>No saved zones.</T>}</Glass>
        <T v="caption" muted>Add a time zone</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{ZONES.filter((z) => !zones.some((x) => x.tz === z)).map((z) => <Chip key={z} testID={`zone-${z}`} label={z} onPress={() => db.add("worldClocks", { tz: z })} />)}</View>
      </> : null}

      {tab === "alarms" ? <>
        {alarms.length ? alarms.map((a) => (
          <Glass key={a.id} testID={`alarm-${a.id}`} onPress={() => alarmForm(a)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}><T v="largeTitle" color={a.enabled ? undefined : colors.muted}>{a.time}</T><T v="caption" muted>{a.label} · {a.days?.length ? a.days.map((d: number) => "SMTWTFS"[d]).join("") : "every day"}</T>{a.error ? <T v="caption" color={colors.warning}>{a.error}</T> : null}</View>
            <Chip testID={`alarm-toggle-${a.id}`} label={a.enabled ? "On" : "Off"} active={a.enabled} onPress={async () => { if (a.enabled) { await cancelMany(a.notifIds); db.update("alarms", a.id, { enabled: false, notifIds: [] }); } else { const r = await scheduleAlarm(a.label, a.time, a.days ?? []); db.update("alarms", a.id, { enabled: true, notifIds: r.ids, error: r.error }); } }} />
          </Glass>)) : <Empty testID="alarms-empty" icon="alarm-outline" title="No alarms" action="New alarm" onAction={() => alarmForm()} />}
        <Btn testID="alarm-add-button" label="New alarm" icon="add" onPress={() => alarmForm()} />
        <Btn kind="secondary" label="Snooze test: remind in 5 min" testID="alarm-snooze-test" onPress={async () => { const r = await scheduleReminder("Snoozed alarm", new Date(Date.now() + 5 * 60000), { kind: "alarm", priority: "high" }); ui.toast(r.error ?? "Snoozed 5 minutes"); }} />
        <T v="caption" muted>Honest note: alarms use scheduled local notifications. Android battery optimisation or Do Not Disturb may delay or silence them, and exact full-screen alarm APIs require a native build. Notifications scheduled with the OS survive app restarts; after a device reboot Android restores them when supported. For critical wake-ups keep a system alarm as backup.</T>
      </> : null}

      {tab === "timer" ? <Glass style={{ gap: spacing.md, alignItems: "center" }}>
        <Big testID="timer-display">{fmtMs(tRemain)}</Big>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>{[1, 3, 5, 10, 15, 25, 45, 60].map((m) => <Chip key={m} testID={`timer-preset-${m}`} label={`${m}m`} active={tDur === m * 60000 && !tEnd} onPress={() => { setTDur(m * 60000); setTLeft(0); setTEnd(null); }} />)}</View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {tEnd ? <Btn testID="timer-pause" label="Pause" kind="secondary" onPress={() => { setTLeft(tRemain); setTEnd(null); if (tNotif) cancelMany([tNotif]); }} /> : <Btn testID="timer-start" label={tLeft ? "Resume" : "Start"} onPress={async () => { const end = Date.now() + (tLeft || tDur); setTEnd(end); const r = await scheduleReminder("Timer finished", new Date(end), { kind: "timer", priority: "high" }); setTNotif(r.notifId); }} />}
          <Btn testID="timer-reset" label="Reset" kind="ghost" onPress={() => { setTEnd(null); setTLeft(0); if (tNotif) cancelMany([tNotif]); }} />
        </View>
      </Glass> : null}

      {tab === "stopwatch" ? <Glass style={{ gap: spacing.md }}>
        <Big testID="stopwatch-display">{fmtMs(swTime, true)}</Big>
        <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
          {swStart ? <Btn testID="sw-stop" label="Stop" kind="danger" onPress={() => { setSwAcc(swTime); setSwStart(null); }} /> : <Btn testID="sw-start" label="Start" onPress={() => setSwStart(Date.now())} />}
          <Btn testID="sw-lap" label="Lap" kind="secondary" disabled={!swStart} onPress={() => setLaps([swTime, ...laps])} />
          <Btn testID="sw-reset" label="Reset" kind="ghost" onPress={() => { setSwStart(null); setSwAcc(0); setLaps([]); }} />
        </View>
        {laps.map((l, i) => <Row key={i} title={`Lap ${laps.length - i}`} right={<T>{fmtMs(l - (laps[i + 1] ?? 0), true)}</T>} />)}
      </Glass> : null}

      {tab === "focus" ? <>
        <Glass style={{ gap: spacing.md, alignItems: "center" }} testID="focus-panel">
          <Badge label={fMode === "work" ? "FOCUS" : "BREAK"} tone={fMode === "work" ? "brand" : "success"} />
          <Big testID="focus-display">{fmtMs(fRemain).slice(3)}</Big>
          {!fEnd ? <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>{[15, 25, 45, 50, 90].map((m) => <Chip key={m} testID={`focus-len-${m}`} label={`${m}m`} active={fMin === m} onPress={() => setFMin(m)} />)}<Chip label="Study" active={fKind === "study"} onPress={() => setFKind("study")} /><Chip label="Work" active={fKind === "work"} onPress={() => setFKind("work")} /></View> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {fEnd ? <><Btn testID="focus-stop" label="End early" kind="secondary" onPress={() => finishFocus(true)} /><Btn testID="focus-distraction" label={`Distracted (${interrupts})`} kind="ghost" onPress={() => { setInterrupts(interrupts + 1); db.add("timeLogs", { activity: "Focus interruption", category: "Distraction", minutes: 0, date: new Date().toISOString(), distraction: true }); }} /></> : <Btn testID="focus-start" label={fMode === "work" ? "Start focus" : "Start break"} icon="play" onPress={startFocus} />}
          </View>
          <T v="caption" muted>{fCount} session(s) this run · every 4th break is longer</T>
        </Glass>
        <T v="headline">Today · {durLabel(today.reduce((a, s) => a + s.minutes, 0))}</T>
        <Glass>{sessions.slice(0, 15).map((s, i) => <View key={s.id}>{i ? <Divider /> : null}<Row title={`${s.minutes}m ${s.kind}${s.completed ? "" : " (ended early)"}`} subtitle={`${fmtDT(s.start)} · ${s.interruptions ?? 0} interruption(s)`} /></View>)}{!sessions.length ? <T muted>No focus history yet.</T> : null}</Glass>
      </> : null}

      {tab === "log" ? <>
        <T muted>Time Leak Detector: log what you actually did. Categorise locally to see where time goes (Analytics).</T>
        <Btn testID="timelog-add" label="Log activity" icon="add" onPress={() => ui.form({ title: "Log activity", fields: [{ key: "activity", label: "Activity", type: "text", required: true }, { key: "category", label: "Category", type: "select", required: true, options: ["Study", "Work", "Social media", "Entertainment", "Commute", "Chores", "Exercise", "Rest", "Other"].map((x) => ({ label: x, value: x })) }, { key: "minutes", label: "Minutes", type: "number", required: true }, { key: "distraction", label: "This was a distraction", type: "toggle" }], initial: { category: "Other" }, onSubmit: (v) => { if (v.minutes <= 0) return "Minutes must be positive."; db.add("timeLogs", { ...v, date: new Date().toISOString() }); } })} />
        <Glass>{logs.slice(0, 30).map((l, i) => <View key={l.id}>{i ? <Divider /> : null}<Row title={l.activity} subtitle={`${l.category} · ${l.minutes}m · ${fmtDT(l.date)}${l.distraction ? " · distraction" : ""}`} right={<IconBtn label="Delete" icon="trash-outline" onPress={() => db.remove("timeLogs", l.id)} />} /></View>)}{!logs.length ? <T muted>No entries.</T> : null}</Glass>
      </> : null}
      <Pressable />
    </Screen>
  );
}
