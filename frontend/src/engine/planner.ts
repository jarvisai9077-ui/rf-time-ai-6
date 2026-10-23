// Deterministic local planning & scheduling engine. Every suggestion carries an explanation.
import { addDays, addMonths, addWeeks, addYears, endOfDay, startOfDay } from "date-fns";
import { db, Item, Settings } from "@/src/store/db";
import { atMin, durLabel, fmtDay, fmtTime, hmToMin } from "./time";

export type Occ = Item & { s: Date; e: Date; occKey: string };

// Expand (recurring) events into occurrences within [from, to].
export function expandEvents(events: Item[], from: Date, to: Date): Occ[] {
  const out: Occ[] = [];
  for (const ev of events) {
    const s0 = new Date(ev.start); const e0 = new Date(ev.end ?? ev.start);
    const len = e0.getTime() - s0.getTime();
    const rec = ev.recurrence ?? "none";
    const until = ev.recurUntil ? endOfDay(new Date(ev.recurUntil)) : null;
    const ex: string[] = ev.exceptions ?? [];
    if (rec === "none") { if (e0 >= from && s0 <= to) out.push({ ...ev, s: s0, e: e0, occKey: ev.id }); continue; }
    for (let n = 0; n < 800; n++) {
      let s: Date;
      if (rec === "weekdays") { s = addDays(s0, n); if (s.getDay() === 0 || s.getDay() === 6) continue; }
      else s = rec === "daily" ? addDays(s0, n) : rec === "weekly" ? addWeeks(s0, n) : rec === "monthly" ? addMonths(s0, n) : addYears(s0, n);
      if (s > to || (until && s > until)) break;
      const e = new Date(s.getTime() + len);
      const key = `${ev.id}@${s.toISOString().slice(0, 10)}`;
      if (e >= from && !ex.includes(s.toISOString().slice(0, 10))) out.push({ ...ev, s, e, occKey: key });
    }
  }
  return out.sort((a, b) => a.s.getTime() - b.s.getTime());
}

export const visibleEvents = () => {
  const hidden = new Set(db.list("calendars").filter((c) => c.visible === false).map((c) => c.id));
  return db.list("events").filter((e) => !hidden.has(e.calendarId));
};
export const dayEvents = (day: Date) => expandEvents(visibleEvents(), startOfDay(day), endOfDay(day));

export type Slot = { s: Date; e: Date; min: number };
// Free time inside working hours, outside sleep, minus events with buffer/travel padding.
export function freeSlots(day: Date, st: Settings, extraBusy: { s: Date; e: Date }[] = []): Slot[] {
  let start = atMin(day, Math.max(hmToMin(st.workStart), hmToMin(st.sleepEnd)));
  const end = atMin(day, Math.min(hmToMin(st.workEnd), hmToMin(st.sleepStart) || 1440));
  const now = new Date();
  if (startOfDay(day).getTime() === startOfDay(now).getTime() && now > start) { start = new Date(now); start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0); }
  const busy = [
    ...dayEvents(day).filter((e) => !e.allDay).map((e) => ({
      s: new Date(e.s.getTime() - ((e.travelMin ?? 0) + (e.bufferMin ?? st.bufferMin)) * 60000),
      e: new Date(e.e.getTime() + ((e.travelMin ?? 0) + (e.bufferMin ?? st.bufferMin)) * 60000),
    })),
    ...extraBusy,
  ].sort((a, b) => a.s.getTime() - b.s.getTime());
  const slots: Slot[] = [];
  let cur = start;
  for (const b of busy) {
    if (b.s > cur && b.s <= end) slots.push({ s: cur, e: b.s, min: (b.s.getTime() - cur.getTime()) / 60000 });
    if (b.e > cur) cur = b.e;
  }
  if (end > cur) slots.push({ s: cur, e: end, min: (end.getTime() - cur.getTime()) / 60000 });
  return slots.filter((x) => x.min >= 15);
}
export const freeMinutes = (day: Date, st: Settings) => freeSlots(day, st).reduce((a, b) => a + b.min, 0);

export function taskScore(t: Item): { score: number; why: string[] } {
  const why: string[] = [];
  let score = (5 - (t.priority ?? 3)) * 10;
  why.push(`priority P${t.priority ?? 3}`);
  if (t.due) {
    const days = (new Date(t.due).getTime() - Date.now()) / 86400000;
    if (days < 0) { score += 50; why.push("overdue"); }
    else if (days < 1) { score += 35; why.push("due today"); }
    else if (days < 3) { score += 20; why.push(`due in ${Math.ceil(days)}d`); }
    else score += Math.max(0, 10 - days);
  }
  const blockers = depsOpen(t);
  if (blockers.length) { score -= 100; why.push(`blocked by "${blockers[0].title}"`); }
  return { score, why };
}
export const depsOpen = (t: Item) => (t.dependsOn ?? []).map((id: string) => db.find("tasks", id)).filter((x: Item | undefined) => x && !x.deleted && x.status !== "done") as Item[];
export const openTasks = () => db.list("tasks").filter((t) => t.status !== "done" && !t.archived);
export const prioritized = () => openTasks().filter((t) => !t.someday).map((t) => ({ t, ...taskScore(t) })).sort((a, b) => b.score - a.score);

export type Block = { title: string; start: Date; end: Date; taskId?: string; why: string; kind: "task" | "study" };
export type PlanResult = { blocks: Block[]; unscheduled: { title: string; reason: string }[]; notes: string[] };

// Smart time blocking: place tasks into free slots across the given days.
export function planTasks(tasks: Item[], days: Date[], st: Settings): PlanResult {
  const blocks: Block[] = []; const unscheduled: PlanResult["unscheduled"] = []; const notes: string[] = [];
  const ranked = tasks.map((t) => ({ t, ...taskScore(t) })).sort((a, b) => b.score - a.score);
  const slotsByDay = days.map((d) => freeSlots(d, st));
  const hiS = hmToMin(st.highEnergyStart), hiE = hmToMin(st.highEnergyEnd);
  for (const { t, why } of ranked) {
    if (depsOpen(t).length) { unscheduled.push({ title: t.title, reason: `waiting on dependency "${depsOpen(t)[0].title}"` }); continue; }
    const need = t.estMin || 30;
    if (!t.estMin) notes.push(`"${t.title}" has no estimate; assumed 30m.`);
    const demanding = (t.priority ?? 3) <= 2 || t.energy === "high";
    let placed = false;
    for (let di = 0; di < days.length && !placed; di++) {
      if (t.due && startOfDay(days[di]) > new Date(t.due)) break;
      const slots = slotsByDay[di];
      const order = slots.map((s, i) => i).sort((a, b) => {
        if (!demanding) return 0;
        const ia = hmToMin(fmtTime(slots[a].s)) >= hiS && hmToMin(fmtTime(slots[a].s)) < hiE ? 0 : 1;
        const ib = hmToMin(fmtTime(slots[b].s)) >= hiS && hmToMin(fmtTime(slots[b].s)) < hiE ? 0 : 1;
        return ia - ib;
      });
      for (const i of order) {
        const sl = slots[i];
        if (sl.min >= need) {
          const start = sl.s; const end = new Date(start.getTime() + need * 60000);
          const inHigh = hmToMin(fmtTime(start)) >= hiS && hmToMin(fmtTime(start)) < hiE;
          blocks.push({ title: t.title, start, end, taskId: t.id, kind: "task", why: `${why.join(", ")}; first free ${durLabel(need)} slot on ${fmtDay(start)}${demanding && inHigh ? " in your high-energy window" : ""}` });
          const ns = new Date(end.getTime() + st.bufferMin * 60000);
          slots[i] = { s: ns, e: sl.e, min: (sl.e.getTime() - ns.getTime()) / 60000 };
          placed = true; break;
        }
      }
    }
    if (!placed) unscheduled.push({ title: t.title, reason: t.due ? `no ${durLabel(need)} free slot before the deadline` : `no ${durLabel(need)} free slot in the planning window` });
  }
  return { blocks, unscheduled, notes };
}

// Schedule N minutes of a named activity before a deadline, chunked into sessions.
export function planChunks(title: string, totalMin: number, deadline: Date, st: Settings, chunk = 60): PlanResult {
  const blocks: Block[] = []; const notes: string[] = [];
  let remaining = totalMin;
  const days: Date[] = [];
  for (let d = startOfDay(new Date()); d <= deadline && days.length < 60; d = addDays(d, 1)) days.push(d);
  for (const d of days) {
    if (remaining <= 0) break;
    for (const sl of freeSlots(d, st, blocks.map((b) => ({ s: b.start, e: b.end })))) {
      if (remaining <= 0) break;
      const len = Math.min(chunk, remaining, Math.floor(sl.min));
      if (len < 25) continue;
      const end = new Date(sl.s.getTime() + len * 60000);
      if (end > deadline) continue;
      blocks.push({ title, start: sl.s, end, kind: "study", why: `spread across days before ${fmtDay(deadline)} (max ${chunk}m per session)` });
      remaining -= len;
      break; // one session per day for spacing
    }
  }
  if (remaining > 0) notes.push(`Only ${durLabel(totalMin - remaining)} of ${durLabel(totalMin)} fits before ${fmtDay(deadline)}. Consider extending the deadline or freeing time.`);
  return { blocks, unscheduled: remaining > 0 ? [{ title, reason: `${durLabel(remaining)} could not be placed` }] : [], notes };
}

export function conflicts(from: Date, to: Date) {
  const occ = expandEvents(visibleEvents(), from, to).filter((e) => !e.allDay);
  const out: { a: Occ; b: Occ }[] = [];
  for (let i = 0; i < occ.length; i++) for (let j = i + 1; j < occ.length; j++) {
    if (occ[j].s >= occ[i].e) break;
    out.push({ a: occ[i], b: occ[j] });
  }
  return out;
}
export function suggestSlot(day: Date, min: number, st: Settings, excludeId?: string): Slot | null {
  for (let i = 0; i < 7; i++) {
    const s = freeSlots(addDays(day, i), st).find((x) => x.min >= min);
    if (s) return s;
  }
  return null;
}

export function deadlineRisk(t: Item, st: Settings): { level: "ok" | "tight" | "at risk" | "unknown"; detail: string } {
  if (!t.due) return { level: "unknown", detail: "No deadline set" };
  const due = new Date(t.due);
  const work = openTasks().filter((x) => x.due && new Date(x.due) <= due);
  const missing = work.filter((x) => !x.estMin).length;
  const need = work.reduce((a, x) => a + (x.estMin || 0), 0);
  let avail = 0;
  for (let d = startOfDay(new Date()); d <= due && avail < 100000; d = addDays(d, 1)) avail += freeMinutes(d, st);
  if (due < new Date()) return { level: "at risk", detail: "Already overdue" };
  const ratio = avail ? need / avail : 99;
  const level = ratio > 0.9 ? "at risk" : ratio > 0.6 ? "tight" : "ok";
  return { level: missing && !need ? "unknown" : level, detail: `${durLabel(need)} of estimated work due by then vs ${durLabel(avail)} free time${missing ? ` (${missing} task(s) lack estimates — estimate incomplete)` : ""}` };
}

export function todayBudget(st: Settings) {
  const d = new Date();
  const free = freeMinutes(d, st);
  const dueToday = openTasks().filter((t) => t.due && new Date(t.due) <= endOfDay(d));
  const need = dueToday.reduce((a, t) => a + (t.estMin || 30), 0);
  const events = dayEvents(d).filter((e) => !e.allDay).reduce((a, e) => a + (e.e.getTime() - e.s.getTime()) / 60000, 0);
  return { free, need, events, over: need > free };
}

// What-if simulation; never mutates data.
export function simulate(opts: { dailyStudyMin: number; weeklyProjectMin: number; reserveWeekends: boolean; routineShiftMin: number }, st: Settings) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i));
  const baseFree = days.reduce((a, d) => a + freeMinutes(d, st), 0);
  const weekendFree = days.filter((d) => d.getDay() === 0 || d.getDay() === 6).reduce((a, d) => a + freeMinutes(d, st), 0);
  const added = opts.dailyStudyMin * 7 + opts.weeklyProjectMin;
  const scenarioFree = baseFree - added - (opts.reserveWeekends ? weekendFree : 0);
  const taskNeed = openTasks().reduce((a, t) => a + (t.estMin || 0), 0);
  const noEst = openTasks().filter((t) => !t.estMin).length;
  const topicNeed = db.list("topics").filter((t) => !t.completed).reduce((a, t) => a + (t.estMin || 60), 0);
  const studyRate = opts.dailyStudyMin + (opts.reserveWeekends ? weekendFree / 7 : 0);
  const syllabusDays = studyRate > 0 ? Math.ceil(topicNeed / studyRate) : null;
  const taskWeeks = scenarioFree > 0 ? taskNeed / scenarioFree : null;
  return {
    baseFree, scenarioFree, added, taskNeed, topicNeed, syllabusDays, taskWeeks,
    feasible: scenarioFree >= 0,
    assumptions: [
      "Uses your working hours, sleep window, buffers and existing calendar for the next 7 days.",
      "Assumes next weeks look like this week.",
      `${noEst} open task(s) have no estimate and are excluded from workload.`,
      "Topics without an estimate are assumed to need 60 minutes.",
      opts.routineShiftMin ? `Routine shift of ${opts.routineShiftMin}m changes when time is free, not how much.` : "",
    ].filter(Boolean),
  };
}
