// Local-first data store. Every collection persists to on-device storage
// (AsyncStorage on Android). No network is ever used.
import { useSyncExternalStore } from "react";
import { storage } from "@/src/utils/storage";

export const SCHEMA_VERSION = 2;
const PREFIX = "tai_";

export const COLLECTIONS = [
  "events", "calendars", "tasks", "notes", "goals", "habits", "routines", "projects", "workspaces",
  "databases", "subjects", "topics", "flashcards", "questions", "attempts", "studySessions", "exams",
  "assignments", "focusSessions", "alarms", "worldClocks", "automations", "queue", "messages", "memory",
  "transactions", "budgets", "savings", "bills", "wellness", "lists", "importantDates", "admin",
  "lifeAreas", "checkins", "timeLogs", "profiles", "templates", "inbox", "kidsLog", "reminders",
] as const;
export type Col = (typeof COLLECTIONS)[number];

export type Item = { id: string; createdAt: string; updatedAt: string; deleted?: boolean; [k: string]: any };

export type Settings = {
  theme: "system" | "light" | "dark";
  weekStart: 0 | 1;
  workStart: string; workEnd: string; sleepStart: string; sleepEnd: string;
  highEnergyStart: string; highEnergyEnd: string; lowEnergyStart: string; lowEnergyEnd: string;
  bufferMin: number; quietStart: string; quietEnd: string; dailyStudyGoalMin: number;
  dashboard: { key: string; visible: boolean }[];
  modules: { key: string; visible: boolean }[];
  appLock: boolean; kidsMode: boolean; activeProfileId?: string;
  memoryEnabled: boolean; notificationsEnabled: boolean; onboarded: boolean;
  pomodoroWork: number; pomodoroBreak: number; currency: string;
  briefingMorning: string; briefingEvening: string; recentSearches: string[];
  kidsSections: string[];
};

export const DASHBOARD_WIDGETS: Record<string, string> = {
  schedule: "Today's schedule", next: "Next event & deadlines", tasks: "Prioritized tasks",
  budget: "Daily time budget", goals: "Goals & milestones", habits: "Habits & routines",
  learning: "Learning & revisions", focus: "Focus sessions", pinned: "Pinned items",
  notes: "Recent notes & workspaces", ai: "Pending AI actions", insights: "Personal insights",
  quick: "Quick actions",
};

export const MODULES: Record<string, { label: string; icon: string; route: string }> = {
  tasks: { label: "Tasks", icon: "checkmark-done", route: "/tasks" },
  notes: { label: "Notes", icon: "document-text", route: "/notes" },
  goals: { label: "Goals & Habits", icon: "flag", route: "/goals" },
  projects: { label: "Projects", icon: "briefcase", route: "/projects" },
  workspaces: { label: "Workspaces", icon: "albums", route: "/workspaces" },
  databases: { label: "Databases", icon: "grid", route: "/databases" },
  student: { label: "Student Mode", icon: "school", route: "/student" },
  kids: { label: "Kids Mode", icon: "happy", route: "/kids" },
  clock: { label: "Clock & Focus", icon: "alarm", route: "/clock" },
  lifeos: { label: "Life OS", icon: "planet", route: "/lifeos" },
  finance: { label: "Finance", icon: "wallet", route: "/finance" },
  wellness: { label: "Wellness", icon: "leaf", route: "/wellness" },
  family: { label: "Family & Errands", icon: "people", route: "/family" },
  admin: { label: "Life Admin", icon: "file-tray-full", route: "/admin" },
  analytics: { label: "Analytics", icon: "stats-chart", route: "/analytics" },
  automations: { label: "Automations", icon: "git-branch", route: "/automations" },
  queue: { label: "Action Queue", icon: "list-circle", route: "/queue" },
  whatif: { label: "What-If Planner", icon: "flask", route: "/whatif" },
  briefing: { label: "Briefings", icon: "sunny", route: "/briefing" },
  search: { label: "Search", icon: "search", route: "/search" },
  settings: { label: "Settings & Data", icon: "settings", route: "/settings" },
};

export const defaultSettings: Settings = {
  theme: "system", weekStart: 1, workStart: "08:00", workEnd: "21:00", sleepStart: "23:00", sleepEnd: "07:00",
  highEnergyStart: "09:00", highEnergyEnd: "12:00", lowEnergyStart: "14:00", lowEnergyEnd: "16:00",
  bufferMin: 10, quietStart: "22:30", quietEnd: "07:00", dailyStudyGoalMin: 60,
  dashboard: Object.keys(DASHBOARD_WIDGETS).map((key) => ({ key, visible: true })),
  modules: Object.keys(MODULES).map((key) => ({ key, visible: true })),
  appLock: false, kidsMode: false, memoryEnabled: true, notificationsEnabled: true, onboarded: false,
  pomodoroWork: 25, pomodoroBreak: 5, currency: "$", briefingMorning: "07:30", briefingEvening: "20:30",
  recentSearches: [], kidsSections: ["math", "words", "reading", "routine"],
};

type State = { ready: boolean; data: Record<Col, Item[]>; settings: Settings; persistError: string | null; undo: { label: string; col: Col; before: Item[] }[] };

const empty = () => Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as Record<Col, Item[]>;
let state: State = { ready: false, data: empty(), settings: defaultSettings, persistError: null, undo: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; emit(); };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const nowISO = () => new Date().toISOString();

// ---- persistence (debounced, per collection) ----
const dirty = new Set<string>();
let timer: any = null;
function schedulePersist(key: string) {
  dirty.add(key);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
export async function flush() {
  const keys = [...dirty];
  dirty.clear();
  for (const k of keys) {
    const value = k === "settings" ? state.settings : state.data[k as Col];
    const ok = await storage.setItem(PREFIX + k, JSON.stringify(value));
    if (!ok) set({ persistError: `Could not save "${k}" to device storage. Storage may be full. Your change is kept in memory; free space and reopen the app.` });
  }
}

function migrate(from: number, data: Record<Col, Item[]>, settings: Settings) {
  // v1 -> v2: tasks gain subtasks/dependsOn arrays; settings gain new keys
  if (from < 2) {
    data.tasks = data.tasks.map((t) => ({ subtasks: [], dependsOn: [], tags: [], ...t }));
  }
  const s = { ...defaultSettings, ...settings };
  for (const k of Object.keys(DASHBOARD_WIDGETS)) if (!s.dashboard.find((d) => d.key === k)) s.dashboard.push({ key: k, visible: true });
  for (const k of Object.keys(MODULES)) if (!s.modules.find((d) => d.key === k)) s.modules.push({ key: k, visible: true });
  return { data, settings: s };
}

export async function hydrate() {
  const data = empty();
  const errors: string[] = [];
  for (const c of COLLECTIONS) {
    const raw = await storage.getItem(PREFIX + c, null as string | null);
    if (raw) {
      try { const arr = JSON.parse(String(raw)); if (Array.isArray(arr)) data[c] = arr; else errors.push(c); } catch { errors.push(c); }
    }
  }
  let settings = defaultSettings;
  const rawS = await storage.getItem(PREFIX + "settings", null as string | null);
  if (rawS) { try { settings = { ...defaultSettings, ...JSON.parse(String(rawS)) }; } catch { errors.push("settings"); } }
  const version = Number(await storage.getItem(PREFIX + "schema", 0)) || 0;
  let m = { data, settings };
  try { m = migrate(version, data, settings); } catch (e: any) { errors.push("migration: " + e?.message); }
  await storage.setItem(PREFIX + "schema", SCHEMA_VERSION);
  // Recovery: actions that were running when the app was killed are marked failed (retryable)
  m.data.queue = m.data.queue.map((q) => (q.status === "running" ? { ...q, status: "failed", error: "Interrupted: app was closed while running. You can retry." } : q));
  if (m.data.calendars.length === 0) {
    const t = nowISO();
    m.data.calendars = [
      { id: "personal", name: "Personal", color: "#FF5E00", visible: true, createdAt: t, updatedAt: t },
      { id: "study", name: "Study", color: "#0A6CFF", visible: true, createdAt: t, updatedAt: t },
      { id: "work", name: "Work", color: "#1F9D55", visible: true, createdAt: t, updatedAt: t },
      { id: "family", name: "Family", color: "#AF52DE", visible: true, createdAt: t, updatedAt: t },
    ];
    m.data.lifeAreas = ["Study", "Work", "Personal", "Family", "Finance", "Wellness", "Projects", "Learning", "Household"].map((name) => ({ id: name.toLowerCase(), name, createdAt: t, updatedAt: t }));
    schedulePersist("calendars"); schedulePersist("lifeAreas");
  }
  set({ ready: true, data: m.data, settings: m.settings, persistError: errors.length ? `Some local data could not be read (${errors.join(", ")}). Those sections were reset; restore a backup from Settings if needed.` : null });
}

// ---- CRUD ----
function pushUndo(label: string, col: Col) {
  const undo = [{ label, col, before: state.data[col] }, ...state.undo].slice(0, 40);
  state = { ...state, undo };
}
function setCol(col: Col, items: Item[]) {
  state = { ...state, data: { ...state.data, [col]: items } };
  schedulePersist(col);
  emit();
}

export const db = {
  get: () => state,
  list: (col: Col) => state.data[col].filter((i) => !i.deleted),
  find: (col: Col, id: string) => state.data[col].find((i) => i.id === id),
  add(col: Col, data: Record<string, any>, label?: string): Item {
    pushUndo(label ?? `Add to ${col}`, col);
    const t = nowISO();
    const item: Item = { ...data, id: data.id ?? uid(), createdAt: t, updatedAt: t };
    setCol(col, [item, ...state.data[col]]);
    return item;
  },
  addMany(col: Col, items: Record<string, any>[], label?: string): Item[] {
    pushUndo(label ?? `Add ${items.length} to ${col}`, col);
    const t = nowISO();
    const made = items.map((d) => ({ ...d, id: d.id ?? uid(), createdAt: t, updatedAt: t }));
    setCol(col, [...made, ...state.data[col]]);
    return made;
  },
  update(col: Col, id: string, patch: Record<string, any>, label?: string, skipUndo = false) {
    if (!skipUndo) pushUndo(label ?? `Edit ${col}`, col);
    setCol(col, state.data[col].map((i) => (i.id === id ? { ...i, ...patch, updatedAt: nowISO() } : i)));
  },
  remove(col: Col, id: string, label?: string) {
    pushUndo(label ?? `Delete from ${col}`, col);
    setCol(col, state.data[col].map((i) => (i.id === id ? { ...i, deleted: true, deletedAt: nowISO() } : i)));
  },
  restore(col: Col, id: string) {
    pushUndo(`Restore ${col}`, col);
    setCol(col, state.data[col].map((i) => (i.id === id ? { ...i, deleted: false } : i)));
  },
  purge(col: Col, id: string) {
    pushUndo(`Permanently delete`, col);
    setCol(col, state.data[col].filter((i) => i.id !== id));
  },
  replace(col: Col, items: Item[], label?: string) {
    pushUndo(label ?? `Replace ${col}`, col);
    setCol(col, items);
  },
  undo(): string | null {
    const [top, ...rest] = state.undo;
    if (!top) return null;
    state = { ...state, undo: rest };
    setCol(top.col, top.before);
    return top.label;
  },
  setSettings(patch: Partial<Settings>) {
    state = { ...state, settings: { ...state.settings, ...patch } };
    schedulePersist("settings");
    emit();
  },
  clearPersistError() { set({ persistError: null }); },
  snapshot() {
    return { app: "TIME_AI", schema: SCHEMA_VERSION, exportedAt: nowISO(), settings: state.settings, data: state.data };
  },
  validateBackup(obj: any): string | null {
    if (!obj || typeof obj !== "object") return "File is not a valid JSON backup.";
    if (obj.app !== "TIME_AI") return "This file is not a TIME AI backup.";
    if (typeof obj.schema !== "number" || obj.schema > SCHEMA_VERSION) return "Backup was made by a newer app version.";
    if (!obj.data || typeof obj.data !== "object") return "Backup is missing data.";
    for (const [k, v] of Object.entries(obj.data)) if (!Array.isArray(v)) return `Backup section "${k}" is corrupted.`;
    return null;
  },
  restoreBackup(obj: any, mode: "replace" | "merge") {
    const incoming = migrate(obj.schema, { ...empty(), ...obj.data }, obj.settings ?? state.settings);
    const data = { ...state.data };
    for (const c of COLLECTIONS) {
      const inc = incoming.data[c] ?? [];
      if (mode === "replace") data[c] = inc;
      else {
        const ids = new Set(data[c].map((i) => i.id));
        data[c] = [...data[c], ...inc.filter((i) => !ids.has(i.id))]; // duplicate detection by id
      }
      schedulePersist(c);
    }
    state = { ...state, data, settings: mode === "replace" ? incoming.settings : state.settings, undo: [] };
    schedulePersist("settings");
    emit();
  },
  async clearAll() {
    for (const c of COLLECTIONS) await storage.removeItem(PREFIX + c);
    await storage.removeItem(PREFIX + "settings");
    state = { ...state, data: empty(), settings: defaultSettings, undo: [] };
    await hydrate();
  },
  integrityCheck(): string[] {
    const issues: string[] = [];
    for (const c of COLLECTIONS) {
      const seen = new Set<string>();
      for (const i of state.data[c]) {
        if (!i.id) issues.push(`${c}: record without id`);
        else if (seen.has(i.id)) issues.push(`${c}: duplicate id ${i.id}`);
        seen.add(i.id);
      }
    }
    const taskIds = new Set(state.data.tasks.map((t) => t.id));
    for (const t of state.data.tasks) for (const d of t.dependsOn ?? []) if (!taskIds.has(d)) issues.push(`Task "${t.title}" depends on a missing task`);
    return issues;
  },
  repairDuplicates() {
    for (const c of COLLECTIONS) {
      const seen = new Set<string>();
      const clean = state.data[c].filter((i) => (i.id && !seen.has(i.id) ? (seen.add(i.id), true) : false));
      if (clean.length !== state.data[c].length) setCol(c, clean);
    }
    setCol("tasks", state.data.tasks.map((t) => ({ ...t, dependsOn: (t.dependsOn ?? []).filter((d: string) => state.data.tasks.some((x) => x.id === d)) })));
  },
};

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}
const cache = new Map<string, { src: Item[]; out: Item[] }>();
export function useCol(col: Col): Item[] {
  const src = useSyncExternalStore(subscribe, () => state.data[col], () => state.data[col]);
  const c = cache.get(col);
  if (c && c.src === src) return c.out;
  const out = src.filter((i) => !i.deleted);
  cache.set(col, { src, out });
  return out;
}
export const useSettings = () => useStore((s) => s.settings);
