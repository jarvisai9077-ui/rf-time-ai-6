// Tiny error bus so any component/engine can surface a friendly message without import cycles.
const listeners = new Set<(msg: string) => void>();
export const onAppError = (l: (msg: string) => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function reportError(e: unknown, context?: string) {
  const msg = (e as any)?.message ?? String(e ?? "Unknown error");
  if (__DEV__) console.warn("[TIME AI]", context ?? "", msg);
  listeners.forEach((l) => l(`${context ? context + ": " : ""}${msg}`));
}
// Runs a handler; sync or async errors become a toast instead of a crash.
export function safely(fn: () => any, context?: string) {
  try {
    const r = fn();
    if (r && typeof r.then === "function") r.catch((e: unknown) => reportError(e, context));
  } catch (e) { reportError(e, context); }
}
