// Shared form schemas + quick-create helpers so every module creates records the same way.
import { router } from "expo-router";
import { db, Item } from "@/src/store/db";
import { scheduleReminder, cancelReminder } from "@/src/engine/notify";
import { Field } from "./overlay";

export const PRIO = [{ label: "P1 High", value: 1 }, { label: "P2", value: 2 }, { label: "P3 Normal", value: 3 }, { label: "P4 Low", value: 4 }];
export const RECUR = [{ label: "None", value: "none" }, { label: "Daily", value: "daily" }, { label: "Weekdays", value: "weekdays" }, { label: "Weekly", value: "weekly" }, { label: "Monthly", value: "monthly" }, { label: "Yearly", value: "yearly" }];

export const taskFields = (): Field[] => [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "priority", label: "Priority", type: "select", options: PRIO },
  { key: "due", label: "Due", type: "datetime" },
  { key: "start", label: "Start date", type: "date" },
  { key: "estMin", label: "Estimated minutes", type: "number" },
  { key: "actualMin", label: "Actual minutes", type: "number" },
  { key: "energy", label: "Energy needed", type: "select", options: [{ label: "High focus", value: "high" }, { label: "Light", value: "low" }] },
  { key: "recurrence", label: "Repeat", type: "select", options: RECUR },
  { key: "tags", label: "Tags", type: "tags" },
  { key: "projectId", label: "Project", type: "select", options: db.list("projects").map((p) => ({ label: p.title, value: p.id })) },
  { key: "goalId", label: "Goal", type: "select", options: db.list("goals").map((p) => ({ label: p.title, value: p.id })) },
  { key: "areaId", label: "Life area", type: "select", options: db.list("lifeAreas").map((p) => ({ label: p.name, value: p.id })) },
  { key: "dependsOn", label: "Depends on (must finish first)", type: "multiselect", options: db.list("tasks").filter((t) => t.status !== "done").slice(0, 20).map((t) => ({ label: t.title.slice(0, 24), value: t.id })) },
  { key: "reminderAt", label: "Reminder", type: "datetime" },
  { key: "someday", label: "Someday / maybe", type: "toggle" },
  { key: "notes", label: "Notes", type: "multiline" },
];

export async function saveTask(v: Record<string, any>, existing?: Item): Promise<string | void> {
  if (v.start && v.due && new Date(v.start) > new Date(v.due)) return "Start date must be before the due date.";
  if (existing && (v.dependsOn ?? []).includes(existing.id)) return "A task cannot depend on itself.";
  const data: Record<string, any> = { ...v, priority: v.priority || 3, recurrence: v.recurrence || "none" };
  let t: Item;
  if (existing) { db.update("tasks", existing.id, data, "Edit task"); t = { ...existing, ...data }; }
  else t = db.add("tasks", { status: "todo", subtasks: [], ...data, dependsOn: data.dependsOn ?? [] }, "Add task");
  if (v.reminderAt && v.reminderAt !== existing?.reminderAt && new Date(v.reminderAt) > new Date()) {
    const r = await scheduleReminder(t.title, new Date(v.reminderAt), { kind: "task", refId: t.id, priority: v.priority === 1 ? "high" : "normal" });
    db.update("tasks", t.id, { notifId: r.notifId }, undefined, true);
  }
}

export function completeTask(t: Item) {
  const done = t.status !== "done";
  db.update("tasks", t.id, { status: done ? "done" : "todo", completedAt: done ? new Date().toISOString() : null }, done ? "Complete task" : "Reopen task");
  if (done && t.notifId) cancelReminder(t.notifId);
  // Recurring tasks spawn the next instance on completion
  if (done && t.recurrence && t.recurrence !== "none" && t.due) {
    const d = new Date(t.due);
    if (t.recurrence === "daily") d.setDate(d.getDate() + 1);
    else if (t.recurrence === "weekdays") { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); }
    else if (t.recurrence === "weekly") d.setDate(d.getDate() + 7);
    else if (t.recurrence === "monthly") d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    const { id, createdAt, updatedAt, completedAt, status, notifId, ...rest } = t;
    db.add("tasks", { ...rest, status: "todo", due: d.toISOString(), subtasks: (t.subtasks ?? []).map((s: any) => ({ ...s, done: false })) });
  }
  return done;
}

export const eventFields = (): Field[] => [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "allDay", label: "All-day", type: "toggle" },
  { key: "start", label: "Start", type: "datetime", required: true },
  { key: "end", label: "End", type: "datetime", required: true },
  { key: "calendarId", label: "Calendar", type: "select", options: db.list("calendars").map((c) => ({ label: c.name, value: c.id })) },
  { key: "category", label: "Category", type: "select", options: ["Meeting", "Class", "Appointment", "Personal", "Focus", "Study", "Family"].map((x) => ({ label: x, value: x })) },
  { key: "priority", label: "Priority", type: "select", options: PRIO },
  { key: "recurrence", label: "Repeat", type: "select", options: RECUR },
  { key: "recurUntil", label: "Repeat until", type: "date" },
  { key: "location", label: "Location", type: "text" },
  { key: "travelMin", label: "Travel minutes (each way)", type: "number" },
  { key: "bufferMin", label: "Buffer minutes", type: "number" },
  { key: "reminderMin", label: "Remind minutes before", type: "number" },
  { key: "tz", label: "Time zone (display note)", type: "text", placeholder: Intl.DateTimeFormat().resolvedOptions().timeZone },
  { key: "locked", label: "Protected (planner & agent never move it)", type: "toggle" },
  { key: "labels", label: "Labels", type: "tags" },
  { key: "description", label: "Description", type: "multiline" },
];
export async function saveEvent(v: Record<string, any>, existing?: Item): Promise<string | void> {
  if (new Date(v.end) < new Date(v.start)) return "End must be after start.";
  const data = { ...v, calendarId: v.calendarId || "personal", recurrence: v.recurrence || "none", priority: v.priority || 3, tz: v.tz || Intl.DateTimeFormat().resolvedOptions().timeZone };
  let e: Item;
  if (existing) { db.update("events", existing.id, data, "Edit event"); e = { ...existing, ...data }; }
  else e = db.add("events", data, "Add event");
  if (v.reminderMin !== undefined && v.reminderMin !== null) {
    const at = new Date(new Date(v.start).getTime() - v.reminderMin * 60000);
    if (at > new Date()) { const r = await scheduleReminder(e.title, at, { kind: "event", refId: e.id, body: `Starts at ${new Date(v.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, priority: v.priority === 1 ? "high" : "normal" }); db.update("events", e.id, { notifId: r.notifId }, undefined, true); }
  }
}

export const go = (path: string) => router.push(path as any);
