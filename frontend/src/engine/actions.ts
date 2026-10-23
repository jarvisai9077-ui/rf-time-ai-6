// Controlled internal action layer used by the AI Agent, automations and the execution queue.
// Every action is validated before running and records undo data.
import { db, Item } from "@/src/store/db";
import { scheduleReminder } from "./notify";
import { fmtDT } from "./time";

export type ActionKind =
  | "create_task" | "update_task" | "complete_task" | "delete_task" | "create_event" | "delete_event"
  | "create_goal" | "create_project" | "create_note" | "create_habit" | "create_topics" | "create_reminder"
  | "set_memory" | "create_tasks_bulk" | "create_events_bulk" | "log_habit" | "create_workspace";
export type Action = { kind: ActionKind; payload: any; label: string; destructive?: boolean };

export const ACTION_INFO: Record<ActionKind, string> = {
  create_task: "Create a task", update_task: "Edit a task", complete_task: "Mark task done", delete_task: "Delete a task (recoverable)",
  create_event: "Create a calendar event", delete_event: "Delete an event (recoverable)", create_goal: "Create a goal", create_project: "Create a project",
  create_note: "Create a note", create_habit: "Create a habit", create_topics: "Add study topics", create_reminder: "Schedule a local reminder",
  set_memory: "Save a preference to memory", create_tasks_bulk: "Create several tasks", create_events_bulk: "Add time blocks to calendar",
  log_habit: "Record a habit for today", create_workspace: "Create a workspace",
};

export function validate(a: Action): string | null {
  const p = a.payload ?? {};
  switch (a.kind) {
    case "create_task": case "create_goal": case "create_project": case "create_note": case "create_habit": case "create_workspace":
      if (!String(p.title ?? p.name ?? "").trim()) return "A title is required."; break;
    case "update_task": case "complete_task": case "delete_task": if (!db.find("tasks", p.id) || db.find("tasks", p.id)?.deleted) return "Task no longer exists."; break;
    case "delete_event": if (!db.find("events", p.id)) return "Event no longer exists."; break;
    case "log_habit": if (!db.find("habits", p.id)) return "Habit no longer exists."; break;
    case "create_event": {
      if (!p.title) return "Event needs a title.";
      if (!p.start || isNaN(new Date(p.start).getTime())) return "Event needs a valid start time.";
      if (p.end && new Date(p.end) < new Date(p.start)) return "End time is before start time."; break;
    }
    case "create_events_bulk": if (!Array.isArray(p.events) || !p.events.length) return "Nothing to schedule."; break;
    case "create_tasks_bulk": if (!Array.isArray(p.tasks) || !p.tasks.length) return "No tasks to create."; break;
    case "create_topics": if (!p.subjectId || !p.topics?.length) return "Subject and topics required."; break;
    case "create_reminder": if (!p.at || new Date(p.at) <= new Date()) return "Reminder time must be in the future."; break;
    case "set_memory": if (!db.get().settings.memoryEnabled) return "Memory is disabled in Settings."; break;
  }
  return null;
}

// Returns undo info. Throws on failure; callers only report success after this resolves.
export async function execute(a: Action): Promise<{ undo: any; result: string }> {
  const err = validate(a);
  if (err) throw new Error(err);
  const p = a.payload;
  switch (a.kind) {
    case "create_task": { const t = db.add("tasks", { status: "todo", priority: 3, subtasks: [], dependsOn: [], tags: [], ...p }, "AI: create task"); return { undo: { col: "tasks", ids: [t.id] }, result: `Task "${t.title}" created` }; }
    case "create_tasks_bulk": { const ts = db.addMany("tasks", p.tasks.map((t: any) => ({ status: "todo", priority: 3, subtasks: [], dependsOn: [], tags: [], ...t })), "AI: create tasks"); return { undo: { col: "tasks", ids: ts.map((t) => t.id) }, result: `${ts.length} tasks created` }; }
    case "update_task": { const before = db.find("tasks", p.id); db.update("tasks", p.id, p.patch, "AI: edit task"); return { undo: { col: "tasks", restore: before }, result: `Task updated` }; }
    case "complete_task": { const before = db.find("tasks", p.id)!; db.update("tasks", p.id, { status: "done", completedAt: new Date().toISOString() }, "AI: complete task"); return { undo: { col: "tasks", restore: before }, result: `"${before.title}" marked done` }; }
    case "delete_task": { db.remove("tasks", p.id, "AI: delete task"); return { undo: { col: "tasks", undelete: p.id }, result: "Task moved to trash" }; }
    case "delete_event": { db.remove("events", p.id, "AI: delete event"); return { undo: { col: "events", undelete: p.id }, result: "Event moved to trash" }; }
    case "create_event": { const e = db.add("events", { calendarId: "personal", recurrence: "none", priority: 3, ...p, end: p.end ?? new Date(new Date(p.start).getTime() + 3600000).toISOString() }, "AI: create event"); return { undo: { col: "events", ids: [e.id] }, result: `Event "${e.title}" on ${fmtDT(e.start)}` }; }
    case "create_events_bulk": { const es = db.addMany("events", p.events.map((e: any) => ({ calendarId: "personal", recurrence: "none", priority: 3, ...e })), "AI: time blocks"); return { undo: { col: "events", ids: es.map((e) => e.id) }, result: `${es.length} time block(s) added` }; }
    case "create_goal": { const g = db.add("goals", { term: "short", target: 100, current: 0, unit: "%", milestones: [], ...p }, "AI: create goal"); return { undo: { col: "goals", ids: [g.id] }, result: `Goal "${g.title}" created` }; }
    case "create_project": {
      const pr = db.add("projects", { status: "active", milestones: [], ...p, tasks: undefined }, "AI: create project");
      const ts = p.tasks?.length ? db.addMany("tasks", p.tasks.map((t: any) => ({ status: "todo", priority: 3, subtasks: [], dependsOn: [], tags: [], ...t, projectId: pr.id }))) : [];
      return { undo: { col: "projects", ids: [pr.id], also: { col: "tasks", ids: ts.map((t) => t.id) } }, result: `Project "${pr.title}" created${ts.length ? ` with ${ts.length} tasks` : ""}` };
    }
    case "create_note": { const n = db.add("notes", { body: "", tags: [], folder: "General", ...p }, "AI: create note"); return { undo: { col: "notes", ids: [n.id] }, result: `Note "${n.title}" saved` }; }
    case "create_habit": { const h = db.add("habits", { schedule: "daily", targetPerWeek: 7, log: [], ...p }, "AI: create habit"); return { undo: { col: "habits", ids: [h.id] }, result: `Habit "${h.title}" created` }; }
    case "create_workspace": { const w = db.add("workspaces", { icon: "albums", ...p, name: p.name ?? p.title }); return { undo: { col: "workspaces", ids: [w.id] }, result: `Workspace "${w.name}" created` }; }
    case "log_habit": { const h = db.find("habits", p.id)!; const d = new Date().toISOString().slice(0, 10); db.update("habits", h.id, { log: [...new Set([...(h.log ?? []), d])] }); return { undo: { col: "habits", restore: h }, result: `"${h.title}" logged for today` }; }
    case "create_topics": { const ts = db.addMany("topics", p.topics.map((t: any) => ({ subjectId: p.subjectId, difficulty: 3, confidence: 3, estMin: 60, prereqIds: [], ...t })), "AI: topics"); return { undo: { col: "topics", ids: ts.map((t) => t.id) }, result: `${ts.length} topics added` }; }
    case "create_reminder": { const r = await scheduleReminder(p.title, new Date(p.at), { kind: "custom" }); return { undo: null, result: r.error ? `Reminder saved in-app for ${fmtDT(r.date)} (${r.error})` : `Reminder set for ${fmtDT(r.date)}${r.shifted ? " (moved out of quiet hours)" : ""}` }; }
    case "set_memory": { const m = db.add("memory", { key: p.key, value: p.value, enabled: true }); return { undo: { col: "memory", ids: [m.id] }, result: `Saved to memory: ${p.value}` }; }
  }
}

export function undoAction(undo: any) {
  if (!undo) throw new Error("This action cannot be undone automatically.");
  const run = (u: any) => {
    if (u.ids) for (const id of u.ids) db.purge(u.col, id);
    if (u.restore) db.update(u.col, u.restore.id, u.restore, "Undo");
    if (u.undelete) db.restore(u.col, u.undelete);
  };
  run(undo); if (undo.also) run(undo.also);
}

const hashOf = (a: Action) => a.kind + ":" + JSON.stringify(a.payload);

// Execution queue
export function enqueue(actions: Action[], source: string): Item[] {
  const existing = db.list("queue");
  const fresh = actions.filter((a) => !existing.some((q) => q.hash === hashOf(a) && (q.status === "pending" || (q.status === "completed" && Date.now() - new Date(q.updatedAt).getTime() < 60000))));
  return fresh.map((a) => db.add("queue", { ...a, hash: hashOf(a), status: "pending", source, log: [`${new Date().toLocaleTimeString()} queued by ${source}`] }, "Queue action"));
}
export async function runQueued(id: string): Promise<Item> {
  const q = db.find("queue", id)!;
  if (q.status === "running") throw new Error("Already running");
  db.update("queue", id, { status: "running", log: [...q.log, `${new Date().toLocaleTimeString()} running`] }, undefined, true);
  try {
    const r = await execute({ kind: q.kind, payload: q.payload, label: q.label });
    db.update("queue", id, { status: "completed", result: r.result, undoData: r.undo, error: null, log: [...db.find("queue", id)!.log, `${new Date().toLocaleTimeString()} completed: ${r.result}`] }, undefined, true);
  } catch (e: any) {
    db.update("queue", id, { status: "failed", error: e?.message ?? String(e), log: [...db.find("queue", id)!.log, `${new Date().toLocaleTimeString()} failed: ${e?.message}`] }, undefined, true);
  }
  return db.find("queue", id)!;
}
export function cancelQueued(id: string) { const q = db.find("queue", id)!; db.update("queue", id, { status: "cancelled", log: [...q.log, `${new Date().toLocaleTimeString()} cancelled`] }, undefined, true); }
export function undoQueued(id: string) {
  const q = db.find("queue", id)!;
  undoAction(q.undoData);
  db.update("queue", id, { status: "undone", log: [...q.log, `${new Date().toLocaleTimeString()} undone`] }, undefined, true);
}
