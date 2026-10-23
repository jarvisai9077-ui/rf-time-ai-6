// Local file import/export (JSON backup, ICS calendar, CSV). Nothing leaves the device unless the
// user explicitly shares a file through the system share sheet.
import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";
import { db, Item } from "@/src/store/db";

export async function saveAndShare(filename: string, content: string, mime: string): Promise<string> {
  if (Platform.OS === "web") {
    const g: any = globalThis as any;
    const blob = new g.Blob([content], { type: mime });
    const url = g.URL.createObjectURL(blob);
    const a = g.document.createElement("a"); a.href = url; a.download = filename; a.click();
    return "Downloaded " + filename;
  }
  const { File, Paths } = require("expo-file-system");
  const Sharing = require("expo-sharing");
  const f = new File(Paths.document, filename);
  try { if (f.exists) f.delete(); f.create(); f.write(content); }
  catch (e: any) { throw new Error("Could not write file (low storage?): " + (e?.message ?? e)); }
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: filename });
  return "Saved to app documents: " + filename;
}

export async function pickText(types: string[] = ["*/*"]): Promise<{ name: string; text: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  if (/\.pdf$/i.test(a.name)) throw new Error("PDF text extraction isn't available offline in this build. Export your PDF as .txt and import that instead.");
  if (/\.(png|jpe?g|heic)$/i.test(a.name)) throw new Error("No on-device OCR engine is installed in this build. Please type or paste the text instead.");
  if ((a.size ?? 0) > 5_000_000) throw new Error("File is larger than 5 MB.");
  let text: string;
  if (Platform.OS === "web") text = await (await fetch(a.uri)).text();
  else { const { File } = require("expo-file-system"); text = await new File(a.uri).text(); }
  return { name: a.name, text };
}

// ---- ICS ----
const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const RR: Record<string, string> = { daily: "FREQ=DAILY", weekly: "FREQ=WEEKLY", monthly: "FREQ=MONTHLY", yearly: "FREQ=YEARLY", weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" };
export function toICS(events: Item[]) {
  const esc = (s = "") => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TIME AI//Offline//EN",
    ...events.flatMap((e) => ["BEGIN:VEVENT", `UID:${e.id}@timeai`, `DTSTAMP:${icsDate(e.updatedAt)}`, `DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(e.end ?? e.start)}`, `SUMMARY:${esc(e.title)}`, e.location ? `LOCATION:${esc(e.location)}` : "", e.description ? `DESCRIPTION:${esc(e.description)}` : "", RR[e.recurrence] ? `RRULE:${RR[e.recurrence]}` : "", "END:VEVENT"].filter(Boolean)),
    "END:VCALENDAR"].join("\r\n");
}
export function fromICS(text: string) {
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error("Not a valid .ics calendar file.");
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const parseD = (v: string) => {
    const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
    if (!m) return null;
    return m[4] ? (m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : new Date(+m[1], +m[2] - 1, +m[3]);
  };
  const out: any[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const get = (k: string) => block.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, "m"))?.[1]?.trim();
    const s = parseD(get("DTSTART") ?? ""); if (!s) continue;
    const e = parseD(get("DTEND") ?? "") ?? new Date(s.getTime() + 3600000);
    const rr = get("RRULE") ?? "";
    const un = (x?: string) => (x ?? "").replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1");
    out.push({ title: un(get("SUMMARY")) || "Untitled", start: s.toISOString(), end: e.toISOString(), allDay: !/T\d/.test(get("DTSTART") ?? ""), location: un(get("LOCATION")), description: un(get("DESCRIPTION")), recurrence: /BYDAY=MO,TU,WE,TH,FR/.test(rr) ? "weekdays" : (rr.match(/FREQ=(\w+)/)?.[1]?.toLowerCase() ?? "none"), calendarId: "personal", importUid: get("UID") });
  }
  return out;
}

// ---- CSV ----
export function toCSV(headers: string[], rows: any[][]) {
  const q = (v: any) => { const s = v === undefined || v === null ? "" : Array.isArray(v) ? v.join("|") : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers.map(q).join(","), ...rows.map((r) => r.map(q).join(","))].join("\n");
}
export function fromCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export async function exportBackup() {
  return saveAndShare(`timeai-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db.snapshot()), "application/json");
}
