// Local notifications only (no push server). Respects quiet hours & permission state.
import { Linking, Platform } from "react-native";
import { db } from "@/src/store/db";
import { hmToMin, minsOfDay } from "./time";

let N: typeof import("expo-notifications") | null = null;
if (Platform.OS !== "web") {
  try { N = require("expo-notifications"); N!.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) as any }); } catch { N = null; }
}
export type PermState = "granted" | "undetermined" | "denied" | "blocked" | "unsupported";

export async function permState(): Promise<PermState> {
  if (!N) return "unsupported";
  try {
    const p = await N.getPermissionsAsync();
    if (p.granted) return "granted";
    if (p.status === "undetermined") return "undetermined";
    return p.canAskAgain ? "denied" : "blocked";
  } catch { return "unsupported"; }
}
export const CHANNEL = "reminders";
// Android channels must exist before scheduling so notifications show (with sound) even when the app is closed.
let channelsReady: Promise<void> | null = null;
export function initNotifications() {
  if (!N || Platform.OS !== "android") return Promise.resolve();
  channelsReady ??= (async () => {
    try {
      await N!.setNotificationChannelAsync(CHANNEL, { name: "Reminders & tasks", importance: N!.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250], lightColor: "#FF5E00", lockscreenVisibility: N!.AndroidNotificationVisibility.PUBLIC, sound: "default" });
      await N!.setNotificationChannelAsync("alarms", { name: "Alarms & timers", importance: N!.AndroidImportance.MAX, vibrationPattern: [0, 500, 300, 500], bypassDnd: false, sound: "default", lockscreenVisibility: N!.AndroidNotificationVisibility.PUBLIC });
    } catch {}
  })();
  return channelsReady;
}
// Tapping a notification (app open, backgrounded or killed) opens the related screen.
export function listenForTaps(open: (route: string) => void) {
  if (!N) return () => {};
  const route = (r: any) => { const d = r?.notification?.request?.content?.data ?? {}; open(d.route ?? "/"); };
  N.getLastNotificationResponseAsync().then((r) => r && route(r)).catch(() => {});
  const sub = N.addNotificationResponseReceivedListener(route);
  return () => sub.remove();
}
export async function requestPerm(): Promise<PermState> {
  if (!N) return "unsupported";
  try {
    await initNotifications();
    const p = await N.requestPermissionsAsync();
    return p.granted ? "granted" : p.canAskAgain ? "denied" : "blocked";
  } catch { return "unsupported"; }
}
export const openSettings = () => Linking.openSettings();

function applyQuiet(date: Date, priority: string) {
  const st = db.get().settings;
  if (priority === "high") return { date, shifted: false };
  const qs = hmToMin(st.quietStart), qe = hmToMin(st.quietEnd), m = minsOfDay(date);
  const inQuiet = qs > qe ? m >= qs || m < qe : m >= qs && m < qe;
  if (!inQuiet) return { date, shifted: false };
  const d = new Date(date);
  if (m >= qs && qs > qe) d.setDate(d.getDate() + 1);
  d.setHours(Math.floor(qe / 60), qe % 60, 0, 0);
  return { date: d, shifted: true };
}

const ROUTES: Record<string, string> = { task: "/tasks", event: "/calendar", habit: "/goals?tab=habits", goal: "/goals", bill: "/finance?tab=bills", expiry: "/admin", date: "/family", focus: "/clock?tab=focus", timer: "/clock?tab=timer", alarm: "/clock?tab=alarms", briefing: "/briefing", wellness: "/wellness", custom: "/" };
// Schedules a one-off local reminder. Always records it in the in-app reminder list,
// so it is never lost even if the OS blocks notifications.
export async function scheduleReminder(title: string, at: Date, opts: { body?: string; kind?: string; refId?: string; priority?: "low" | "normal" | "high" } = {}) {
  const { date, shifted } = applyQuiet(at, opts.priority ?? "normal");
  let notifId: string | null = null; let error: string | null = null;
  await initNotifications();
  let st = await permState();
  if (st === "undetermined" && date > new Date()) st = await requestPerm(); // user just asked for a reminder: contextual request
  if (date <= new Date()) error = "Time is in the past";
  else if (st !== "granted") error = st === "unsupported" ? "System notifications are not available here; reminder kept in-app." : "Notification permission not granted; reminder kept in-app.";
  else if (!db.get().settings.notificationsEnabled) error = "Notifications disabled in Settings; reminder kept in-app.";
  else {
    try { notifId = await N!.scheduleNotificationAsync({ content: { title, body: opts.body ?? "TIME AI reminder", sound: "default", data: { route: ROUTES[opts.kind ?? "custom"] ?? "/", refId: opts.refId }, priority: N!.AndroidNotificationPriority.HIGH }, trigger: { type: N!.SchedulableTriggerInputTypes.DATE, date, channelId: ["timer", "alarm", "focus"].includes(opts.kind ?? "") ? "alarms" : CHANNEL } as any }); }
    catch (e: any) { error = "OS refused to schedule: " + (e?.message ?? "unknown"); }
  }
  db.add("reminders", { title, at: date.toISOString(), kind: opts.kind ?? "custom", refId: opts.refId, priority: opts.priority ?? "normal", notifId, error, shifted, fired: false }, "Add reminder");
  return { notifId, error, shifted, date };
}
export async function cancelReminder(notifId?: string | null) {
  if (N && notifId) { try { await N.cancelScheduledNotificationAsync(notifId); } catch {} }
}
export async function notifyNow(title: string, body: string) {
  db.add("inbox", { title, body, read: false }, "Inbox");
  if (N && (await permState()) === "granted" && db.get().settings.notificationsEnabled) {
    try { await initNotifications(); await N.scheduleNotificationAsync({ content: { title, body, data: { route: "/" } }, trigger: Platform.OS === "android" ? ({ channelId: CHANNEL } as any) : null }); } catch {}
  }
}
// Repeating alarm-style notifications (weekday + time). Not exact-alarm guaranteed.
export async function scheduleAlarm(label: string, hm: string, days: number[]): Promise<{ ids: string[]; error: string | null }> {
  if (!N) return { ids: [], error: "System alarms are unavailable on this platform." };
  await initNotifications();
  let ps = await permState();
  if (ps === "undetermined") ps = await requestPerm();
  if (ps !== "granted") return { ids: [], error: ps === "blocked" ? "Notifications are blocked — enable them in system Settings for alarms." : "Notification permission is needed for alarms." };
  const [hour, minute] = hm.split(":").map(Number);
  const ids: string[] = [];
  try {
    if (!days.length) ids.push(await N.scheduleNotificationAsync({ content: { title: "⏰ " + label, body: "Alarm", sound: "default", data: { route: "/clock?tab=alarms" } }, trigger: { type: N.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: "alarms" } as any }));
    else for (const d of days) ids.push(await N.scheduleNotificationAsync({ content: { title: "⏰ " + label, body: "Alarm", sound: "default", data: { route: "/clock?tab=alarms" } }, trigger: { type: N.SchedulableTriggerInputTypes.WEEKLY, weekday: d + 1, hour, minute, channelId: "alarms" } as any }));
    return { ids, error: null };
  } catch (e: any) { return { ids, error: e?.message ?? "Failed to schedule" }; }
}
export async function cancelMany(ids: string[] = []) { for (const id of ids) await cancelReminder(id); }

// Missed-reminder recovery: anything due in the past that hasn't been acknowledged.
export const missedReminders = () => db.list("reminders").filter((r) => !r.fired && new Date(r.at) < new Date());
