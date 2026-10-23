// Trigger → Condition → Action automations, evaluated locally while the app runs.
import { endOfDay } from "date-fns";
import { db, Item } from "@/src/store/db";
import { enqueue } from "./actions";
import { notifyNow } from "./notify";
import { openTasks, planTasks, todayBudget } from "./planner";
import { eveningBriefing, morningBriefing } from "./reports";
import { fmtTime, hmToMin, minsOfDay, todayKey } from "./time";
import { startOfDay, addDays } from "date-fns";

export const TRIGGERS = [
  { label: "Every day at time", value: "daily_time" },
  { label: "Weekly (day + time)", value: "weekly" },
  { label: "Task becomes overdue", value: "task_overdue" },
  { label: "Deadline within N hours", value: "deadline_within" },
  { label: "Workload exceeds free time", value: "workload_exceeds" },
  { label: "App opened", value: "app_open" },
];
export const CONDITIONS = [
  { label: "Always", value: "always" },
  { label: "Only on weekdays", value: "weekdays" },
  { label: "Only on weekends", value: "weekends" },
  { label: "At least N open tasks", value: "min_open" },
];
export const AUTO_ACTIONS = [
  { label: "Send a local notification", value: "notify" },
  { label: "Create a task", value: "create_task" },
  { label: "Prepare morning briefing", value: "briefing_morning" },
  { label: "Prepare evening briefing", value: "briefing_evening" },
  { label: "Suggest reschedule (to queue)", value: "suggest_reschedule" },
];
export const AUTO_TEMPLATES = [
  { name: "Morning briefing", trigger: "daily_time", triggerValue: "07:30", condition: "always", action: "briefing_morning" },
  { name: "Deadline approaching", trigger: "deadline_within", triggerValue: "24", condition: "always", action: "notify", actionValue: "A deadline is within 24 hours" },
  { name: "Overdue → suggest new time", trigger: "task_overdue", condition: "always", action: "suggest_reschedule" },
  { name: "Workload alert", trigger: "workload_exceeds", condition: "always", action: "notify", actionValue: "Today's tasks exceed your free time" },
  { name: "Weekly review task", trigger: "weekly", triggerValue: "0 18:00", condition: "always", action: "create_task", actionValue: "Do weekly review" },
  { name: "Study planning (weekdays)", trigger: "daily_time", triggerValue: "16:00", condition: "weekdays", action: "create_task", actionValue: "Plan today's study session" },
  { name: "Project checklist", trigger: "weekly", triggerValue: "1 09:00", condition: "min_open", conditionValue: "1", action: "notify", actionValue: "Review project checklists" },
];

function triggerFires(a: Item, now: Date): { fires: boolean; detail: string } {
  const ranToday = a.lastRun && a.lastRun.slice(0, 10) === todayKey();
  switch (a.trigger) {
    case "daily_time": return { fires: !ranToday && minsOfDay(now) >= hmToMin(a.triggerValue || "08:00"), detail: `time ${a.triggerValue}` };
    case "weekly": { const [d, t] = String(a.triggerValue || "1 09:00").split(" "); return { fires: !ranToday && now.getDay() === +d && minsOfDay(now) >= hmToMin(t || "09:00"), detail: "weekly" }; }
    case "task_overdue": { const o = openTasks().filter((t) => t.due && new Date(t.due) < now && !(a.handled ?? []).includes(t.id)); return { fires: o.length > 0, detail: `${o.length} overdue` }; }
    case "deadline_within": { const h = +(a.triggerValue || 24); const o = openTasks().filter((t) => t.due && new Date(t.due) > now && new Date(t.due).getTime() - now.getTime() < h * 3600000 && !(a.handled ?? []).includes(t.id)); return { fires: o.length > 0, detail: o.map((t) => t.title).join(", ") }; }
    case "workload_exceeds": { const b = todayBudget(db.get().settings); return { fires: !ranToday && b.over, detail: `need ${b.need}m vs free ${b.free}m` }; }
    case "app_open": return { fires: !ranToday, detail: "app opened" };
  }
  return { fires: false, detail: "" };
}
function conditionOk(a: Item, now: Date) {
  const wd = now.getDay() !== 0 && now.getDay() !== 6;
  if (a.condition === "weekdays") return wd;
  if (a.condition === "weekends") return !wd;
  if (a.condition === "min_open") return openTasks().length >= +(a.conditionValue || 1);
  return true;
}
async function doAction(a: Item, detail: string) {
  switch (a.action) {
    case "notify": await notifyNow(a.name, `${a.actionValue || "Automation"}${detail ? " — " + detail : ""}`); return "Notification sent";
    case "create_task": { const title = a.actionValue || a.name; if (db.list("tasks").some((t) => t.title === title && t.createdAt.slice(0, 10) === todayKey())) return "Skipped: duplicate task already created today"; db.add("tasks", { title, status: "todo", priority: 3, subtasks: [], dependsOn: [], tags: ["automation"], due: endOfDay(new Date()).toISOString() }); return `Task "${title}" created`; }
    case "briefing_morning": await notifyNow("Morning briefing", morningBriefing()); return "Briefing ready in Inbox";
    case "briefing_evening": await notifyNow("Evening briefing", eveningBriefing()); return "Briefing ready in Inbox";
    case "suggest_reschedule": {
      const late = openTasks().filter((t) => t.due && new Date(t.due) < new Date());
      const r = planTasks(late.map((t) => ({ ...t, due: undefined })), [0, 1, 2].map((i) => addDays(startOfDay(new Date()), i)), db.get().settings);
      const q = enqueue(r.blocks.map((b) => ({ kind: "update_task", payload: { id: b.taskId, patch: { due: b.end.toISOString(), start: b.start.toISOString() } }, label: `Reschedule "${b.title}" → ${fmtTime(b.start)} ${b.start.toDateString()}` })), "automation");
      return `${q.length} reschedule suggestion(s) waiting for approval in the Action Queue`;
    }
  }
  return "Unknown action";
}

export async function runAutomation(a: Item, force = false) {
  const now = new Date();
  const t = triggerFires(a, now);
  if (!force && (!t.fires || !conditionOk(a, now))) return null;
  try {
    const result = await doAction(a, t.detail);
    const ids = a.trigger === "task_overdue" ? openTasks().filter((x) => x.due && new Date(x.due) < now).map((x) => x.id) : a.trigger === "deadline_within" ? openTasks().filter((x) => x.due).map((x) => x.id) : [];
    db.update("automations", a.id, { lastRun: now.toISOString(), lastResult: (force ? "[test] " : "") + result, error: null, handled: [...(a.handled ?? []), ...ids].slice(-200), runs: (a.runs ?? 0) + 1 }, undefined, true);
    return result;
  } catch (e: any) {
    db.update("automations", a.id, { lastRun: now.toISOString(), error: e?.message ?? String(e) }, undefined, true);
    return "Error: " + e?.message;
  }
}

let busy = false;
export async function tickAutomations() {
  if (busy) return; busy = true;
  try { for (const a of db.list("automations").filter((x) => x.enabled)) await runAutomation(a); } finally { busy = false; }
}
