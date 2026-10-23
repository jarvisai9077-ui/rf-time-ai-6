// TIME AI Agent — on-device, rule-based natural-language command interpreter.
// It is NOT an LLM. It maps commands to validated internal actions and shows previews.
import { addDays, endOfDay, startOfDay } from "date-fns";
import { db, Item } from "@/src/store/db";
import { Action } from "./actions";
import { recommendTopics } from "./learning";
import { conflicts, freeSlots, planChunks, planTasks, prioritized, todayBudget, openTasks, dayEvents } from "./planner";
import { durLabel, fmtDay, fmtDT, fmtTime, parseWhen } from "./time";
import { morningBriefing, weeklyReview } from "./reports";

export type AgentReply = { text: string; actions: Action[]; needsConfirm?: boolean; clarify?: boolean };

const findTask = (q: string) => {
  const s = q.toLowerCase().trim();
  const ts = openTasks();
  return ts.find((t) => t.title.toLowerCase() === s) ?? ts.find((t) => t.title.toLowerCase().includes(s)) ?? db.list("tasks").find((t) => t.title.toLowerCase().includes(s));
};
const prio = (s: string) => (/\b(urgent|high priority|important|p1)\b/i.test(s) ? 1 : /\b(low priority|p4|someday)\b/i.test(s) ? 4 : /\bp2\b/i.test(s) ? 2 : 3);
const clean = (s: string) => s.replace(/\b(urgent|high priority|low priority|important|p[1-4])\b/gi, "").replace(/^[\s,:-]+|[\s,.:-]+$/g, "").replace(/\s+/g, " ").trim();

const blocksToEvents = (blocks: { title: string; start: Date; end: Date; taskId?: string; why: string; kind: string }[], calendarId: string) =>
  blocks.map((b) => ({ title: b.title, start: b.start.toISOString(), end: b.end.toISOString(), calendarId, taskId: b.taskId, description: "Planned by TIME AI (local planner): " + b.why, category: b.kind === "study" ? "Study" : "Focus" }));

export const HELP = `I'm the on-device TIME AI agent (local rules — no cloud AI). Try:
• add task Submit report by friday high priority 2h
• schedule meeting with Sam tomorrow at 3pm for 1h
• remind me to call mom in 30 minutes
• plan my day
• schedule two hours of revision before friday
• move unfinished tasks
• break project Website into tasks
• create a study plan  /  what should I study
• create goal Read 12 books by 2026-12-31
• add habit Drink water · log habit Drink water
• note Ideas: buy domain, draft logo
• complete task Submit report · delete task X
• show conflicts · what's free today · briefing · weekly review
• remember I prefer studying in the evening
• undo`;

export function interpret(input: string, ctx: { lastTask?: string }): AgentReply {
  const st = db.get().settings;
  const raw = input.trim();
  const s = raw.toLowerCase();
  if (!raw) return { text: "Type a command.", actions: [] };
  if (/^(help|\?|what can you do)/.test(s)) return { text: HELP, actions: [] };

  // ---- memory ----
  let m = raw.match(/^(?:remember|note that|save preference)\s+(?:that\s+)?(.+)$/i);
  if (m && !/^remember to /i.test(raw)) return { text: `I'll store this preference locally (you can view/delete it in Settings › Memory).`, actions: [{ kind: "set_memory", payload: { key: "instruction", value: m[1] }, label: `Remember: ${m[1]}` }] };

  // ---- reminders ----
  m = raw.match(/^(?:remind me(?: to)?|reminder(?: to)?|remember to)\s+(.+)$/i);
  if (m) {
    const w = parseWhen(m[1]);
    if (!w.date) return { text: `When should I remind you to "${clean(w.rest)}"? e.g. "remind me to ${clean(w.rest)} tomorrow at 9am".`, actions: [], clarify: true };
    const at = w.hasTime ? w.date : new Date(w.date.setHours(9, 0));
    return { text: `Reminder preview:`, actions: [{ kind: "create_reminder", payload: { title: clean(w.rest), at: at.toISOString() }, label: `Remind "${clean(w.rest)}" at ${fmtDT(at)}` }, { kind: "create_task", payload: { title: clean(w.rest), due: at.toISOString(), reminderAt: at.toISOString(), priority: 3 }, label: `Also add task "${clean(w.rest)}"` }] };
  }

  // ---- plan my day ----
  if (/plan (my )?(day|today)|daily plan/.test(s)) {
    const tasks = openTasks().filter((t) => !t.someday && !t.scheduledEventId);
    if (!tasks.length) return { text: "You have no open unscheduled tasks to plan. Add tasks first, e.g. \"add task Revise algebra 1h\".", actions: [] };
    const r = planTasks(tasks, [startOfDay(new Date())], st);
    const ev = dayEvents(new Date());
    const text = `Plan for today around ${ev.length} existing event(s), working hours ${st.workStart}–${st.workEnd}, ${st.bufferMin}m buffers:\n` +
      r.blocks.map((b) => `• ${fmtTime(b.start)}–${fmtTime(b.end)} ${b.title}\n   why: ${b.why}`).join("\n") +
      (r.unscheduled.length ? `\nNot placed:\n` + r.unscheduled.map((u) => `• ${u.title} — ${u.reason}`).join("\n") : "") + (r.notes.length ? "\nNotes: " + r.notes.join(" ") : "");
    return { text, actions: r.blocks.length ? [{ kind: "create_events_bulk", payload: { events: blocksToEvents(r.blocks, "personal") }, label: `Add ${r.blocks.length} time block(s) to today` }] : [] };
  }
  if (/plan (my )?week|weekly plan/.test(s)) {
    const tasks = openTasks().filter((t) => !t.someday && !t.scheduledEventId);
    const r = planTasks(tasks, Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i)), st);
    return { text: `Week plan:\n` + r.blocks.map((b) => `• ${fmtDay(b.start)} ${fmtTime(b.start)} ${b.title} — ${b.why}`).join("\n") + (r.unscheduled.length ? "\nNot placed: " + r.unscheduled.map((u) => `${u.title} (${u.reason})`).join("; ") : ""), actions: r.blocks.length ? [{ kind: "create_events_bulk", payload: { events: blocksToEvents(r.blocks, "personal") }, label: `Add ${r.blocks.length} blocks this week` }] : [] };
  }

  // ---- schedule N hours of X before DATE ----
  m = raw.match(/^schedule\s+(.+?)\s+(?:of|for)\s+(.+?)\s+(before|by|until)\s+(.+)$/i);
  if (m) {
    const w = parseWhen(m[1]); const total = w.durationMin;
    const dl = parseWhen("by " + m[4]).date;
    if (!total || !dl) return { text: "I couldn't read the amount or deadline. Try: \"schedule 2 hours of revision before friday\".", actions: [], clarify: true };
    const r = planChunks(m[2].replace(/^(revision|study)$/i, (x) => x[0].toUpperCase() + x.slice(1)), total, endOfDay(dl), st, 60);
    return { text: `Proposed sessions for ${durLabel(total)} of ${m[2]}:\n` + r.blocks.map((b) => `• ${fmtDay(b.start)} ${fmtTime(b.start)}–${fmtTime(b.end)} — ${b.why}`).join("\n") + (r.notes.length ? "\n⚠ " + r.notes.join(" ") : ""), actions: r.blocks.length ? [{ kind: "create_events_bulk", payload: { events: blocksToEvents(r.blocks, "study") }, label: `Add ${r.blocks.length} session(s)` }] : [] };
  }

  // ---- move unfinished / overdue ----
  if (/(move|reschedule|recover).*(unfinished|overdue|missed|incomplete)/.test(s)) {
    const now = new Date();
    const late = openTasks().filter((t) => t.due && new Date(t.due) < now);
    const unscheduled = openTasks().filter((t) => !t.scheduledEventId && !t.someday);
    const target = late.length ? late : unscheduled;
    if (!target.length) return { text: "No unfinished or overdue tasks need moving. 🎉", actions: [] };
    const r = planTasks(target.map((t) => ({ ...t, due: undefined })), Array.from({ length: 5 }, (_, i) => addDays(startOfDay(now), i)), st);
    const acts: Action[] = r.blocks.map((b) => ({ kind: "update_task", payload: { id: b.taskId, patch: { due: b.end.toISOString(), start: b.start.toISOString() } }, label: `Move "${b.title}" → ${fmtDay(b.start)} ${fmtTime(b.start)}` }));
    if (r.blocks.length) acts.push({ kind: "create_events_bulk", payload: { events: blocksToEvents(r.blocks, "personal") }, label: `Block time for ${r.blocks.length} task(s)` });
    return { text: `${target.length} ${late.length ? "overdue" : "unscheduled"} task(s). Suggested slots (protected/locked events untouched):\n` + r.blocks.map((b) => `• ${b.title}: ${fmtDay(b.start)} ${fmtTime(b.start)} — ${b.why}`).join("\n") + (r.unscheduled.length ? "\nCould not place: " + r.unscheduled.map((u) => u.title).join(", ") : ""), actions: acts, needsConfirm: true };
  }

  // ---- break project into tasks ----
  m = raw.match(/^(?:break|split)\s+(?:down\s+)?(?:the\s+|this\s+|my\s+)?(?:project\s+)?(.+?)\s+into\s+(?:manageable\s+|smaller\s+)?(?:tasks|steps)$/i);
  if (m) {
    const name = m[1].replace(/^project\s+/i, "");
    const proj = db.list("projects").find((p) => p.title.toLowerCase().includes(name.toLowerCase()));
    const steps = ["Define scope & success criteria", "Research & gather materials", "Create outline / plan", "Build first draft", "Review & get feedback", "Revise and finalize", "Deliver & wrap-up"];
    const tasks = steps.map((st2, i) => ({ title: `${name}: ${st2}`, estMin: [30, 60, 45, 120, 45, 60, 30][i], priority: 3 }));
    const note = "(Generic 7-step breakdown template — edit steps as needed. Each step depends on the previous one.)";
    if (proj) return { text: `Breakdown for existing project "${proj.title}" ${note}\n` + tasks.map((t) => `• ${t.title} (${durLabel(t.estMin)})`).join("\n"), actions: [{ kind: "create_tasks_bulk", payload: { tasks: tasks.map((t) => ({ ...t, projectId: proj.id })) }, label: `Add ${tasks.length} tasks to ${proj.title}` }] };
    return { text: `New project "${name}" with breakdown ${note}\n` + tasks.map((t) => `• ${t.title}`).join("\n"), actions: [{ kind: "create_project", payload: { title: name, tasks }, label: `Create project "${name}" + ${tasks.length} tasks` }] };
  }

  // ---- study plan ----
  if (/study plan|what should i study|revision plan|next topic/.test(s)) {
    const recs = recommendTopics(5);
    if (!recs.length) return { text: "No study topics yet. Open Student Mode › Subjects to add subjects and topics, or import a syllabus text file. Then ask again.", actions: [] };
    const blocks = planChunks("Study", recs.length * 45, endOfDay(addDays(new Date(), 6)), st, 45).blocks.map((b, i) => ({ ...b, title: `Study: ${recs[i % recs.length].t.name}` }));
    return { text: `Study plan from your topics (local adaptive engine):\n` + recs.map((r) => `• ${r.t.name} — ${r.why.join(", ") || "balanced coverage"}; practice: ${r.difficultyLevel}; review again in ${r.interval}d`).join("\n"), actions: blocks.length ? [{ kind: "create_events_bulk", payload: { events: blocksToEvents(blocks, "study") }, label: `Schedule ${blocks.length} study session(s) this week` }] : [] };
  }

  // ---- conflicts / free time / briefing / review ----
  if (/conflict|overlap|double.?book/.test(s)) {
    const c = conflicts(startOfDay(new Date()), endOfDay(addDays(new Date(), 14)));
    return { text: c.length ? `Found ${c.length} conflict(s) in the next 14 days:\n` + c.map((x) => `• ${fmtDay(x.a.s)}: "${x.a.title}" ${fmtTime(x.a.s)}–${fmtTime(x.a.e)} overlaps "${x.b.title}" ${fmtTime(x.b.s)}`).join("\n") + "\nOpen Calendar to resolve (suggested free slots shown there)." : "No schedule conflicts in the next 14 days.", actions: [] };
  }
  if (/free|available time|how much time/.test(s)) {
    const sl = freeSlots(new Date(), st); const b = todayBudget(st);
    return { text: `Free today: ${durLabel(b.free)} in ${sl.length} slot(s)\n` + sl.map((x) => `• ${fmtTime(x.s)}–${fmtTime(x.e)} (${durLabel(x.min)})`).join("\n") + `\nTasks due today need ~${durLabel(b.need)}${b.over ? " ⚠ more than your free time" : ""}.`, actions: [] };
  }
  if (/brief/.test(s)) return { text: morningBriefing(), actions: [] };
  if (/weekly review|review my week/.test(s)) { const r = weeklyReview(); return { text: r, actions: [{ kind: "create_note", payload: { title: `Weekly review ${fmtDay(new Date())}`, body: r, folder: "Reviews", tags: ["review"] }, label: "Save review as a note" }] }; }
  if (/prioriti[sz]e|what should i do|top tasks|priorities/.test(s)) {
    const p = prioritized().slice(0, 5);
    return { text: p.length ? "Recommended order:\n" + p.map((x, i) => `${i + 1}. ${x.t.title} — ${x.why.join(", ")}`).join("\n") : "No open tasks.", actions: [] };
  }

  // ---- complete / delete ----
  m = raw.match(/^(?:complete|finish|done|mark)\s+(?:task\s+)?(.+?)(?:\s+as done)?$/i);
  if (m) { const t = findTask(m[1] === "it" ? ctx.lastTask ?? "" : m[1]); return t ? { text: `Mark "${t.title}" as done?`, actions: [{ kind: "complete_task", payload: { id: t.id }, label: `Complete "${t.title}"` }] } : { text: `I couldn't find a task matching "${m[1]}".`, actions: [] }; }
  m = raw.match(/^(?:delete|remove)\s+(task|event)\s+(.+)$/i);
  if (m) {
    if (m[1].toLowerCase() === "task") { const t = findTask(m[2]); return t ? { text: `⚠ This will move "${t.title}" to trash (recoverable). Confirm?`, actions: [{ kind: "delete_task", payload: { id: t.id }, label: `Delete task "${t.title}"`, destructive: true }], needsConfirm: true } : { text: `No task matches "${m[2]}".`, actions: [] }; }
    const e = db.list("events").find((x) => x.title.toLowerCase().includes(m![2].toLowerCase()));
    if (e?.locked) return { text: `"${e.title}" is a protected/locked event. Unlock it in the Calendar first.`, actions: [] };
    return e ? { text: `⚠ Delete event "${e.title}"? (recoverable via undo)`, actions: [{ kind: "delete_event", payload: { id: e.id }, label: `Delete event "${e.title}"`, destructive: true }], needsConfirm: true } : { text: `No event matches "${m[2]}".`, actions: [] };
  }

  // ---- habits ----
  m = raw.match(/^(?:log|record|did)\s+(?:habit\s+)?(.+)$/i);
  if (m) { const h = db.list("habits").find((x) => x.title.toLowerCase().includes(m![1].toLowerCase())); if (h) return { text: `Log "${h.title}" for today?`, actions: [{ kind: "log_habit", payload: { id: h.id }, label: `Log ${h.title}` }] }; }
  m = raw.match(/^(?:add|create|new|start)\s+(?:a\s+)?habit\s+(.+)$/i);
  if (m) { const weekly = /weekly/i.test(m[1]); return { text: "New habit:", actions: [{ kind: "create_habit", payload: { title: clean(m[1].replace(/\b(daily|weekly)\b/i, "")), schedule: weekly ? "weekly" : "daily", targetPerWeek: weekly ? 1 : 7 }, label: `Habit "${clean(m[1].replace(/\b(daily|weekly)\b/i, ""))}" (${weekly ? "weekly" : "daily"})` }] }; }

  // ---- goals / projects / notes / workspace ----
  m = raw.match(/^(?:add|create|new|set)\s+(?:a\s+)?goal\s+(?:to\s+)?(.+)$/i);
  if (m) { const w = parseWhen(m[1]); const num = w.rest.match(/\b(\d+)\s+(\w+)/); return { text: "New goal:", actions: [{ kind: "create_goal", payload: { title: clean(w.rest), deadline: w.date?.toISOString(), target: num ? +num[1] : 100, unit: num ? num[2] : "%", term: w.date && w.date.getTime() - Date.now() > 90 * 86400000 ? "long" : "short" }, label: `Goal "${clean(w.rest)}"${w.date ? " by " + fmtDay(w.date) : ""}` }] }; }
  m = raw.match(/^(?:add|create|new|start)\s+(?:a\s+)?project\s+(.+)$/i);
  if (m) { const w = parseWhen(m[1]); return { text: "New project:", actions: [{ kind: "create_project", payload: { title: clean(w.rest), deadline: w.date?.toISOString() }, label: `Project "${clean(w.rest)}"` }] }; }
  m = raw.match(/^(?:add|create|new|start)\s+(?:a\s+)?workspace\s+(.+)$/i);
  if (m) return { text: "New workspace:", actions: [{ kind: "create_workspace", payload: { name: m[1].trim() }, label: `Workspace "${m[1].trim()}"` }] };
  m = raw.match(/^(?:add\s+|create\s+|new\s+|take\s+(?:a\s+)?)?note\s+(.+)$/i);
  if (m) { const [t, ...b] = m[1].split(":"); return { text: "New note:", actions: [{ kind: "create_note", payload: { title: t.trim(), body: b.join(":").trim() }, label: `Note "${t.trim()}"` }] }; }

  // ---- events ----
  m = raw.match(/^(?:schedule|add event|create event|book|add meeting|new event|meeting|event|appointment)\s+(.+)$/i);
  if (m || /\b(meeting|appointment|class|call with|lunch with)\b/i.test(s)) {
    const body = m ? m[1] : raw;
    const w = parseWhen(body);
    if (!w.date) return { text: `When is "${clean(w.rest)}"? Add a day and time, e.g. "tomorrow at 3pm for 1h".`, actions: [], clarify: true };
    if (!w.hasTime) return { text: `What time on ${fmtDay(w.date)}? Or say "all day".`, actions: /all day/i.test(body) ? [{ kind: "create_event", payload: { title: clean(w.rest.replace(/all day/i, "")), start: w.date.toISOString(), end: endOfDay(w.date).toISOString(), allDay: true }, label: `All-day "${clean(w.rest)}" ${fmtDay(w.date)}` }] : [], clarify: !/all day/i.test(body) };
    const end = new Date(w.date.getTime() + (w.durationMin ?? 60) * 60000);
    const clash = dayEvents(w.date).filter((e) => !e.allDay && e.s < end && e.e > w.date!);
    return { text: clash.length ? `⚠ Overlaps with "${clash[0].title}" (${fmtTime(clash[0].s)}–${fmtTime(clash[0].e)}). Add anyway?` : "New event:", actions: [{ kind: "create_event", payload: { title: clean(w.rest.replace(/^(a|an)\s+/i, "")), start: w.date.toISOString(), end: end.toISOString(), calendarId: /class|study|exam|revision/i.test(body) ? "study" : /meeting|work/i.test(body) ? "work" : "personal" }, label: `"${clean(w.rest)}" ${fmtDT(w.date)}–${fmtTime(end)}` }], needsConfirm: clash.length > 0 };
  }

  // ---- tasks (default for add/todo) ----
  m = raw.match(/^(?:add|create|new|todo|task)\s+(?:a\s+)?(?:task\s+|todo\s+)?(?:to\s+)?(.+)$/i);
  if (m) {
    const w = parseWhen(m[1]);
    const title = clean(w.rest);
    if (!title) return { text: "What's the task called?", actions: [], clarify: true };
    return { text: "New task:", actions: [{ kind: "create_task", payload: { title, priority: prio(m[1]), due: w.date?.toISOString(), estMin: w.durationMin, someday: /someday/i.test(m[1]) }, label: `Task "${title}"${w.date ? " due " + fmtDT(w.date) : ""}${w.durationMin ? " · " + durLabel(w.durationMin) : ""} · P${prio(m[1])}` }] };
  }
  return { text: `I didn't understand that. I'm a local rule-based agent, so I work with specific command patterns.\n\n${HELP}`, actions: [] };
}

export const contextTaskTitle = (items: Item[]) => items.find((i) => i.kind === "create_task")?.payload?.title;
