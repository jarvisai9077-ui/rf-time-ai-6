// Date/time helpers + local natural-language date parsing (rule-based).
import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, isSameDay, startOfDay } from "date-fns";

export const fmtTime = (d: Date | string) => format(new Date(d), "HH:mm");
export const fmtDay = (d: Date | string) => format(new Date(d), "EEE d MMM");
export const fmtDate = (d: Date | string) => format(new Date(d), "yyyy-MM-dd");
export const fmtDT = (d: Date | string) => format(new Date(d), "yyyy-MM-dd HH:mm");
export const todayKey = () => fmtDate(new Date());
export const hmToMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + (m || 0); };
export const atMin = (day: Date, min: number) => { const d = startOfDay(day); d.setMinutes(min); return d; };
export const minsOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const durLabel = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}` : `${Math.round(min)}m`);
export const daysUntil = (d: string | Date) => differenceInCalendarDays(new Date(d), new Date());
export { addDays, isSameDay, startOfDay, format, differenceInCalendarDays };

export function parseDateInput(s: string, withTime: boolean): Date | null {
  const m = s.trim().match(withTime ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], withTime ? +m[4] : 0, withTime ? +m[5] : 0);
  if (isNaN(d.getTime()) || d.getMonth() !== +m[2] - 1) return null;
  return d;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export type ParsedWhen = { date?: Date; hasTime: boolean; durationMin?: number; byDeadline?: boolean; rest: string; ambiguous?: string };

// Extracts date/time/duration phrases from text; returns the leftover text.
export function parseWhen(input: string, base = new Date()): ParsedWhen {
  let s = " " + input + " ";
  let day: Date | undefined;
  let time: number | undefined;
  let durationMin: number | undefined;
  let byDeadline = false;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = s.match(re);
    if (m) { fn(m); s = s.replace(m[0], " "); }
  };
  take(/\bfor (\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|mins?|minutes?)\b/i, (m) => { durationMin = Math.round(parseFloat(m[1]) * (m[2].toLowerCase().startsWith("h") ? 60 : 1)); });
  take(/\b(\d+(?:\.\d+)?)\s*(h|hrs?|hours?)\b/i, (m) => { if (!durationMin) durationMin = Math.round(parseFloat(m[1]) * 60); });
  take(/\b(two|three|four|one)\s+hours?\b/i, (m) => { durationMin = ({ one: 1, two: 2, three: 3, four: 4 } as any)[m[1].toLowerCase()] * 60; });
  take(/\bin (\d+)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?)\b/i, (m) => {
    const n = +m[1]; const u = m[2].toLowerCase();
    const d = new Date(base);
    if (u.startsWith("m")) { d.setMinutes(d.getMinutes() + n); day = d; time = minsOfDay(d); }
    else if (u.startsWith("h")) { d.setHours(d.getHours() + n); day = d; time = minsOfDay(d); }
    else if (u.startsWith("d")) day = addDays(d, n);
    else day = addWeeks(d, n);
  });
  take(/\b(\d{4}-\d{2}-\d{2})\b/, (m) => { day = parseDateInput(m[1], false) ?? undefined; });
  take(/\b(by|before|until|due)\s+(today|tomorrow|tonight|next week|end of (?:the )?week|(?:next )?(?:sun|mon|tues|wednes|thurs|fri|satur)day|\d{4}-\d{2}-\d{2})\b/i, (m) => { byDeadline = true; s = s.replace(m[0], " " + m[2] + " "); });
  take(/\b(today|tonight)\b/i, (m) => { day = new Date(base); if (m[1].toLowerCase() === "tonight" && time === undefined) time = 20 * 60; });
  take(/\btomorrow\b/i, () => { day = addDays(base, 1); });
  take(/\bnext week\b/i, () => { day = addDays(base, 7); });
  take(/\bend of (?:the )?week\b/i, () => { const d = new Date(base); day = addDays(d, (5 - d.getDay() + 7) % 7); });
  take(/\b(?:on |this )?(next )?(sun|mon|tues|wednes|thurs|fri|satur)day\b/i, (m) => {
    const idx = WEEKDAYS.findIndex((w) => w.startsWith(m[2].toLowerCase()));
    let diff = (idx - base.getDay() + 7) % 7;
    if (diff === 0 && !byDeadline) diff = 7;
    if (m[1]) diff += diff < 7 ? 7 : 0;
    day = addDays(base, diff);
  });
  take(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i, (m) => {
    let h = +m[1]; const mm = +(m[2] || 0); const ap = m[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
    if (!ap && h < 7) h += 12; // "at 3" → 15:00 is the more common meaning
    time = h * 60 + mm;
  });
  take(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, (m) => {
    let h = +m[1]; const ap = m[3].toLowerCase();
    if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
    time = h * 60 + +(m[2] || 0);
  });
  take(/\b(?:in the )?(morning|afternoon|evening)\b/i, (m) => { if (time === undefined) time = ({ morning: 9, afternoon: 14, evening: 19 } as any)[m[1].toLowerCase()] * 60; });
  if (time !== undefined && !day) day = new Date(base);
  let date: Date | undefined;
  if (day) { date = startOfDay(day); if (time !== undefined) date.setMinutes(time); else if (byDeadline) date.setHours(23, 59); }
  return { date, hasTime: time !== undefined, durationMin, byDeadline, rest: s.replace(/\s+/g, " ").trim() };
}

export type Recurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly";
export function nextOccurrence(start: Date, rec: Recurrence, n: number): Date {
  switch (rec) {
    case "daily": return addDays(start, n);
    case "weekly": return addWeeks(start, n);
    case "monthly": return addMonths(start, n);
    case "yearly": return addYears(start, n);
    default: return start;
  }
}
