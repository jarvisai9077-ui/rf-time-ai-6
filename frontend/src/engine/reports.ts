// Summaries generated strictly from stored local data.
import { addDays, endOfDay, startOfDay } from "date-fns";
import { db } from "@/src/store/db";
import { recommendTopics } from "./learning";
import { dayEvents, deadlineRisk, freeMinutes, openTasks, prioritized } from "./planner";
import { durLabel, fmtDay, fmtTime } from "./time";

const inRange = (iso: string | undefined, a: Date, b: Date) => !!iso && new Date(iso) >= a && new Date(iso) <= b;

export function morningBriefing(): string {
  const st = db.get().settings; const now = new Date();
  const ev = dayEvents(now);
  const p = prioritized().slice(0, 3);
  const due = openTasks().filter((t) => t.due && new Date(t.due) <= endOfDay(addDays(now, 3)));
  const study = ev.filter((e) => e.calendarId === "study");
  const rem = db.list("reminders").filter((r) => inRange(r.at, now, endOfDay(now)));
  const recs = recommendTopics(1);
  return [
    `☀️ Morning briefing — ${fmtDay(now)}`,
    `Schedule: ${ev.length ? ev.map((e) => `${e.allDay ? "all-day" : fmtTime(e.s)} ${e.title}`).join(", ") : "no events"}`,
    `Top priorities: ${p.length ? p.map((x) => x.t.title).join(", ") : "none"}`,
    `Deadlines (3 days): ${due.length ? due.map((t) => `${t.title} (${fmtDay(t.due)})`).join(", ") : "none"}`,
    `Study sessions: ${study.length || "none scheduled"}`,
    `Reminders today: ${rem.length ? rem.map((r) => r.title).join(", ") : "none"}`,
    `Available time: ${durLabel(freeMinutes(now, st))}`,
    recs.length ? `Prep: review "${recs[0].t.name}" (${recs[0].why[0] ?? "due for practice"})` : "",
  ].filter(Boolean).join("\n");
}

export function eveningBriefing(): string {
  const now = new Date(); const a = startOfDay(now), b = endOfDay(now);
  const done = db.list("tasks").filter((t) => t.status === "done" && inRange(t.completedAt, a, b));
  const left = openTasks().filter((t) => t.due && new Date(t.due) <= b);
  const study = db.list("studySessions").filter((s) => inRange(s.date, a, b)).reduce((x, s) => x + (s.actualMin || 0), 0) + db.list("focusSessions").filter((s) => inRange(s.start, a, b) && s.kind === "study").reduce((x, s) => x + s.minutes, 0);
  const habits = db.list("habits"); const hd = habits.filter((h) => h.log?.includes(a.toISOString().slice(0, 10)) || h.log?.includes(now.toISOString().slice(0, 10)));
  const tomorrow = prioritized().slice(0, 3);
  return [
    `🌙 Evening briefing — ${fmtDay(now)}`,
    `Completed: ${done.length ? done.map((t) => t.title).join(", ") : "nothing marked done today"}`,
    `Unfinished (due today): ${left.length ? left.map((t) => t.title).join(", ") : "none"}`,
    `Study time logged: ${durLabel(study)}`,
    `Habits: ${hd.length}/${habits.length} done`,
    `Tomorrow's priorities: ${tomorrow.length ? tomorrow.map((x) => x.t.title).join(", ") : "none"}`,
  ].join("\n");
}

export function weeklyReview(): string {
  const st = db.get().settings; const now = new Date(); const a = startOfDay(addDays(now, -6));
  const tasks = db.list("tasks");
  const done = tasks.filter((t) => t.status === "done" && inRange(t.completedAt, a, now));
  const missed = tasks.filter((t) => t.status !== "done" && t.due && inRange(t.due, a, now));
  const est = done.filter((t) => t.estMin && t.actualMin);
  const acc = est.length ? Math.round((est.reduce((x, t) => x + t.estMin, 0) / est.reduce((x, t) => x + t.actualMin, 0)) * 100) : null;
  const focus = db.list("focusSessions").filter((f) => inRange(f.start, a, now));
  const habits = db.list("habits").map((h) => ({ h, n: (h.log ?? []).filter((d: string) => new Date(d) >= a).length }));
  const distractions = db.list("timeLogs").filter((l) => l.distraction && inRange(l.date, a, now));
  const risks = openTasks().filter((t) => t.due).map((t) => ({ t, r: deadlineRisk(t, st) })).filter((x) => x.r.level === "at risk");
  const tips: string[] = [];
  if (missed.length > 2) tips.push("Several deadlines slipped — try \"move unfinished tasks\" and add estimates so the planner can protect time.");
  if (acc !== null && acc < 80) tips.push(`Tasks took longer than estimated (estimates were ${acc}% of actual) — pad estimates by ~${100 - acc}%.`);
  if (distractions.length > 3) tips.push(`${distractions.length} distractions logged — schedule focus blocks in your high-energy window (${st.highEnergyStart}–${st.highEnergyEnd}).`);
  if (!tips.length) tips.push("Keep the current rhythm; review goals for next week.");
  return [
    `📋 Weekly review (${fmtDay(a)} – ${fmtDay(now)}) — generated locally from your data`,
    `Achievements: ${done.length} task(s) completed${done.length ? ": " + done.slice(0, 8).map((t) => t.title).join(", ") : ""}`,
    `Unfinished/missed deadlines: ${missed.length}${missed.length ? ": " + missed.map((t) => t.title).join(", ") : ""}`,
    `Schedule accuracy: ${acc === null ? "not enough data (log actual durations on tasks)" : acc + "% (estimated vs actual)"}`,
    `Focus: ${focus.length} session(s), ${durLabel(focus.reduce((x, f) => x + f.minutes, 0))}`,
    `Habits: ${habits.map((x) => `${x.h.title} ${x.n}/7`).join(", ") || "none"}`,
    risks.length ? `At-risk deadlines: ${risks.map((x) => x.t.title).join(", ")}` : "",
    `Improvements:\n- ${tips.join("\n- ")}`,
  ].filter(Boolean).join("\n");
}
