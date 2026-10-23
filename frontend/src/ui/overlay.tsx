// App-level overlays: toasts (with undo), confirm dialogs, generic form sheets.
import { createContext, ReactNode, useCallback, useContext, useRef, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeInUp, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDays } from "date-fns";
import { radius, spacing, type, useTheme } from "@/src/theme";
import { fmtDate, fmtDT, parseDateInput } from "@/src/engine/time";
import { Btn, Chip, Icon, T } from "./kit";

export type Field = {
  key: string; label: string;
  type: "text" | "multiline" | "number" | "date" | "datetime" | "time" | "select" | "toggle" | "tags" | "multiselect";
  options?: { label: string; value: any }[]; required?: boolean; placeholder?: string; help?: string;
};
type FormReq = { title: string; fields: Field[]; initial?: Record<string, any>; submitLabel?: string; onSubmit: (v: Record<string, any>) => string | void | Promise<string | void>; onDelete?: () => void; extra?: ReactNode };
type ConfirmReq = { title: string; message: string; confirmLabel?: string; destructive?: boolean; resolve: (b: boolean) => void };
type Ctx = { toast: (msg: string, undo?: () => void) => void; confirm: (o: Omit<ConfirmReq, "resolve">) => Promise<boolean>; form: (r: FormReq) => void; closeForm: () => void; sheet: (title: string, content: ReactNode) => void; closeSheet: () => void };
const UICtx = createContext<Ctx>(null as any);
export const useUI = () => useContext(UICtx);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toastS, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [conf, setConf] = useState<ConfirmReq | null>(null);
  const [form, setForm] = useState<FormReq | null>(null);
  const [sheetS, setSheet] = useState<{ title: string; content: ReactNode } | null>(null);
  const timer = useRef<any>(null);
  const toast = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo }); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), undo ? 5000 : 3000);
  }, []);
  const confirm = useCallback((o: Omit<ConfirmReq, "resolve">) => new Promise<boolean>((resolve) => setConf({ ...o, resolve })), []);
  const ctx: Ctx = { toast, confirm, form: setForm, closeForm: () => setForm(null), sheet: (title, content) => setSheet({ title, content }), closeSheet: () => setSheet(null) };
  return (
    <UICtx.Provider value={ctx}>
      {children}
      {sheetS ? <Sheet title={sheetS.title} onClose={() => setSheet(null)}>{sheetS.content}</Sheet> : null}
      {form ? <FormSheet req={form} onClose={() => setForm(null)} toast={toast} /> : null}
      {conf ? <ConfirmDialog req={conf} onClose={() => setConf(null)} /> : null}
      {toastS ? <Toast msg={toastS.msg} undo={toastS.undo} onClose={() => setToast(null)} /> : null}
    </UICtx.Provider>
  );
}

function Toast({ msg, undo, onClose }: { msg: string; undo?: () => void; onClose: () => void }) {
  const { colors } = useTheme(); const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutDown} pointerEvents="box-none" style={{ position: "absolute", left: spacing.lg, right: spacing.lg, bottom: insets.bottom + 90 }}>
      <View testID="toast" accessibilityLiveRegion="polite" style={{ backgroundColor: colors.surfaceInverse, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text testID="toast-message" style={{ color: colors.onSurfaceInverse, flex: 1, fontSize: 14 }}>{msg}</Text>
        {undo ? <Pressable testID="toast-undo-button" hitSlop={10} onPress={() => { undo(); onClose(); }}><Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>UNDO</Text></Pressable> : null}
      </View>
    </Animated.View>
  );
}

function ConfirmDialog({ req, onClose }: { req: ConfirmReq; onClose: () => void }) {
  const { colors } = useTheme();
  const done = (b: boolean) => { req.resolve(b); onClose(); };
  return (
    <Modal transparent animationType="fade" onRequestClose={() => done(false)}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
        <View testID="confirm-dialog" style={{ backgroundColor: colors.sheet, borderRadius: radius.xl, padding: spacing.xl, width: "100%", maxWidth: 420, gap: spacing.md }}>
          <T v="headline">{req.title}</T>
          <T muted>{req.message}</T>
          <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end", marginTop: spacing.sm }}>
            <Btn testID="confirm-cancel-button" kind="ghost" label="Cancel" onPress={() => done(false)} />
            <Btn testID="confirm-ok-button" kind={req.destructive ? "danger" : "primary"} label={req.confirmLabel ?? "Confirm"} onPress={() => done(true)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { colors } = useTheme(); const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} testID="sheet-backdrop" />
      <View testID="bottom-sheet" style={{ maxHeight: "88%", backgroundColor: colors.sheet, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: insets.bottom + spacing.md }}>
        <View style={{ alignItems: "center", paddingTop: 8 }}><View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong }} /></View>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <T v="title" style={{ flex: 1 }}>{title}</T>
          <Pressable testID="sheet-close-button" accessibilityLabel="Close" hitSlop={10} onPress={onClose}><Icon name="close-circle" size={28} color={colors.muted} /></Pressable>
        </View>
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>{children}</KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const toInput = (f: Field, v: any) => {
  if (v === undefined || v === null) return f.type === "tags" || f.type === "multiselect" ? [] : f.type === "toggle" ? false : "";
  if (f.type === "date") return v ? fmtDate(v) : "";
  if (f.type === "datetime") return v ? fmtDT(v) : "";
  if (f.type === "number") return String(v);
  if (f.type === "tags") return Array.isArray(v) ? v.join(", ") : v;
  return v;
};

function FormSheet({ req, onClose, toast }: { req: FormReq; onClose: () => void; toast: (m: string) => void }) {
  const { colors } = useTheme();
  const [vals, setVals] = useState<Record<string, any>>(() => Object.fromEntries(req.fields.map((f) => [f.key, toInput(f, req.initial?.[f.key])])));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setV = (k: string, v: any) => setVals((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    const out: Record<string, any> = {};
    for (const f of req.fields) {
      const v = vals[f.key];
      if (f.required && (v === "" || v === undefined || (Array.isArray(v) && !v.length))) return setErr(`${f.label} is required.`);
      if (f.type === "number") { if (v === "") { out[f.key] = undefined; continue; } const n = Number(v); if (isNaN(n)) return setErr(`${f.label} must be a number.`); out[f.key] = n; }
      else if (f.type === "date" || f.type === "datetime") { if (!v) { out[f.key] = undefined; continue; } const d = parseDateInput(v, f.type === "datetime"); if (!d) return setErr(`${f.label}: use format ${f.type === "date" ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm"}.`); out[f.key] = d.toISOString(); }
      else if (f.type === "time") { if (v && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) return setErr(`${f.label}: use HH:mm (24h).`); out[f.key] = v ? v.padStart(5, "0") : undefined; }
      else if (f.type === "tags") out[f.key] = String(v).split(",").map((x) => x.trim()).filter(Boolean);
      else out[f.key] = typeof v === "string" ? v.trim() : v;
    }
    setBusy(true);
    try {
      const r = await req.onSubmit(out);
      if (typeof r === "string") { setErr(r); return; }
      onClose();
    } catch (e: any) { setErr(e?.message ?? "Something went wrong. Nothing was saved."); toast("Save failed"); }
    finally { setBusy(false); }
  };
  const inputStyle = [type.body, { color: colors.onSurface, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: 14, minHeight: 48, paddingVertical: 12 }];
  return (
    <Sheet title={req.title} onClose={onClose}>
      {req.fields.length > 6 ? <Btn testID="form-submit-top-button" small label={req.submitLabel ?? "Save"} onPress={submit} disabled={busy} style={{ alignSelf: "flex-end" }} /> : null}
      {req.fields.map((f) => (
        <View key={f.key} style={{ gap: 6 }}>
          {f.type !== "toggle" ? <T v="caption" muted>{f.label}{f.required ? " *" : ""}</T> : null}
          {f.type === "select" || f.type === "multiselect" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {f.options!.map((o) => {
                const on = f.type === "select" ? vals[f.key] === o.value : (vals[f.key] ?? []).includes(o.value);
                return <Chip key={String(o.value)} testID={`field-${f.key}-${o.value}`} label={o.label} active={on} onPress={() => setV(f.key, f.type === "select" ? (on && !f.required ? "" : o.value) : on ? vals[f.key].filter((x: any) => x !== o.value) : [...(vals[f.key] ?? []), o.value])} />;
              })}
            </View>
          ) : f.type === "toggle" ? (
            <Pressable testID={`field-${f.key}`} accessibilityRole="switch" accessibilityState={{ checked: !!vals[f.key] }} onPress={() => setV(f.key, !vals[f.key])} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
              <T>{f.label}</T>
              <View style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: vals[f.key] ? colors.success : colors.surfaceTertiary, padding: 3, alignItems: vals[f.key] ? "flex-end" : "flex-start" }}><View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.onSuccess }} /></View>
            </Pressable>
          ) : (
            <>
              <TextInput testID={`field-${f.key}`} accessibilityLabel={f.label} value={String(vals[f.key] ?? "")} onChangeText={(t) => setV(f.key, t)} placeholder={f.placeholder ?? (f.type === "date" ? "YYYY-MM-DD" : f.type === "datetime" ? "YYYY-MM-DD HH:mm" : f.type === "time" ? "HH:mm" : f.type === "tags" ? "comma, separated" : "")} placeholderTextColor={colors.muted} multiline={f.type === "multiline"} keyboardType={f.type === "number" ? "decimal-pad" : "default"} style={[inputStyle, f.type === "multiline" && { minHeight: 110, textAlignVertical: "top" }]} />
              {f.type === "date" || f.type === "datetime" ? (
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {[["Today", 0], ["Tomorrow", 1], ["+3d", 3], ["+1w", 7]].map(([l, n]) => <Chip key={l as string} label={l as string} onPress={() => { const d = addDays(new Date(), n as number); if (f.type === "datetime") { const prev = parseDateInput(vals[f.key] ?? "", true); d.setHours(prev?.getHours() ?? 9, prev?.getMinutes() ?? 0, 0, 0); setV(f.key, fmtDT(d)); } else setV(f.key, fmtDate(d)); }} />)}
                  {vals[f.key] ? <Chip label="Clear" icon="close" onPress={() => setV(f.key, "")} /> : null}
                </View>
              ) : null}
            </>
          )}
          {f.help ? <T v="caption" muted>{f.help}</T> : null}
        </View>
      ))}
      {req.extra}
      {err ? <View testID="form-error" style={{ backgroundColor: colors.error, borderRadius: radius.md, padding: 12 }}><Text style={{ color: colors.onError }}>{err}</Text></View> : null}
      <Btn testID="form-submit-button" label={req.submitLabel ?? "Save"} onPress={submit} disabled={busy} />
      {req.onDelete ? <Btn testID="form-delete-button" kind="ghost" label="Delete" icon="trash-outline" onPress={() => { req.onDelete!(); onClose(); }} /> : null}
    </Sheet>
  );
}
