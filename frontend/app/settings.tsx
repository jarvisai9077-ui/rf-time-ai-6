import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DASHBOARD_WIDGETS, db, MODULES, SCHEMA_VERSION, useCol, useSettings, COLLECTIONS } from "@/src/store/db";
import { useTheme } from "@/src/theme";
import { exportBackup, pickText } from "@/src/engine/io";
import { openSettings, permState, PermState, requestPerm, missedReminders } from "@/src/engine/notify";
import { clearPin, hasPin, setPin } from "@/src/security";
import { fmtDT } from "@/src/engine/time";
import { Badge, Btn, Chip, ChipRow, Divider, Glass, IconBtn, Row, Screen, Section, T } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";
import { emailSupport, SUPPORT_EMAIL } from "@/src/legal";
import { BrandLogo } from "@/src/ui/brand";
import Constants from "expo-constants";

type Tab = "general" | "planning" | "dashboard" | "modules" | "memory" | "privacy" | "data" | "about";

function Reorder({ list, labels, onChange, testID }: { list: { key: string; visible: boolean }[]; labels: Record<string, string>; onChange: (l: { key: string; visible: boolean }[]) => void; testID: string }) {
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= list.length) return; const c = [...list]; [c[i], c[j]] = [c[j], c[i]]; onChange(c); };
  return <Glass style={{ paddingVertical: 4 }}>{list.filter((x) => labels[x.key]).map((x, i) => (
    <View key={x.key}>{i ? <Divider /> : null}
      <Row title={labels[x.key]} subtitle={x.visible ? "Shown" : "Hidden (data kept)"} right={<View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
        <Chip testID={`${testID}-toggle-${x.key}`} label={x.visible ? "On" : "Off"} active={x.visible} onPress={() => onChange(list.map((y) => (y.key === x.key ? { ...y, visible: !y.visible } : y)))} />
        <IconBtn label="Move up" icon="arrow-up" testID={`${testID}-up-${x.key}`} onPress={() => move(list.indexOf(x), -1)} />
        <IconBtn label="Move down" icon="arrow-down" onPress={() => move(list.indexOf(x), 1)} />
      </View>} />
    </View>))}</Glass>;
}

export default function Settings() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets(); const ui = useUI(); const st = useSettings(); const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>((params.tab as Tab) ?? "general");
  const memory = useCol("memory"); useCol("reminders");
  const [perm, setPerm] = useState<PermState>("undetermined"); const [pin, setPinState] = useState(false);
  useEffect(() => { permState().then(setPerm); hasPin().then(setPinState); }, [tab]);
  const set = db.setSettings;
  const timeForm = () => ui.form({ title: "Planning preferences", initial: st, fields: [
    { key: "workStart", label: "Working/available from", type: "time", required: true }, { key: "workEnd", label: "Working/available until", type: "time", required: true },
    { key: "sleepStart", label: "Sleep starts", type: "time", required: true }, { key: "sleepEnd", label: "Sleep ends", type: "time", required: true },
    { key: "highEnergyStart", label: "High-energy window start", type: "time" }, { key: "highEnergyEnd", label: "High-energy window end", type: "time" },
    { key: "lowEnergyStart", label: "Low-energy window start", type: "time" }, { key: "lowEnergyEnd", label: "Low-energy window end", type: "time" },
    { key: "bufferMin", label: "Buffer between items (min)", type: "number" }, { key: "quietStart", label: "Quiet hours start", type: "time" }, { key: "quietEnd", label: "Quiet hours end", type: "time" },
    { key: "dailyStudyGoalMin", label: "Daily study goal (min)", type: "number" }, { key: "pomodoroWork", label: "Pomodoro focus (min)", type: "number" }, { key: "pomodoroBreak", label: "Pomodoro break (min)", type: "number" },
    { key: "briefingMorning", label: "Morning briefing time", type: "time" }, { key: "briefingEvening", label: "Evening briefing time", type: "time" },
  ], onSubmit: (v) => { if (v.workStart >= v.workEnd) return "Working start must be before end."; set(v); } });
  const permRow = (
    <Glass style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><T v="headline" style={{ flex: 1 }}>Notifications</T><Badge testID="perm-state" label={perm} tone={perm === "granted" ? "success" : perm === "unsupported" ? "muted" : "warning"} /></View>
      <T v="caption" muted>Used only for local reminders, alarms and briefings. Without it, reminders still appear inside the app.</T>
      {perm === "undetermined" || perm === "denied" ? <Btn testID="perm-request" small label="Allow notifications" onPress={async () => { if (await ui.confirm({ title: "Allow notifications?", message: "Get reminders for events, deadlines, habits and alarms — generated on this device.", confirmLabel: "Continue" })) setPerm(await requestPerm()); }} /> : null}
      {perm === "blocked" ? <Btn testID="perm-open-settings" small label="Open Settings" onPress={openSettings} /> : null}
      <Row title="In-app notifications" right={<Chip label={st.notificationsEnabled ? "On" : "Off"} active={st.notificationsEnabled} onPress={() => set({ notificationsEnabled: !st.notificationsEnabled })} />} />
      <T v="caption" muted>{missedReminders().length} missed reminder(s) awaiting acknowledgement (shown on Today).</T>
    </Glass>);
  return (
    <Screen testID="settings-screen" title="Settings & Data" bottomPad={insets.bottom + 40}
      header={<ChipRow testID="settings-tab" value={tab} onChange={setTab} options={(["general", "planning", "dashboard", "modules", "memory", "privacy", "data", "about"] as Tab[]).map((v) => ({ label: v[0].toUpperCase() + v.slice(1), value: v }))} />}>
      {tab === "general" ? <>
        <Section title="Appearance"><Glass style={{ gap: 8 }}><View style={{ flexDirection: "row", gap: 8 }}>{(["system", "light", "dark"] as const).map((t) => <Chip key={t} testID={`theme-${t}`} label={t} active={st.theme === t} onPress={() => set({ theme: t })} />)}</View></Glass></Section>
        <Section title="Week starts on"><Glass><View style={{ flexDirection: "row", gap: 8 }}><Chip testID="weekstart-mon" label="Monday" active={st.weekStart === 1} onPress={() => set({ weekStart: 1 })} /><Chip testID="weekstart-sun" label="Sunday" active={st.weekStart === 0} onPress={() => set({ weekStart: 0 })} /></View></Glass></Section>
        <Section title="Currency"><Glass><View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{["$", "€", "£", "₹", "¥", "₦"].map((c) => <Chip key={c} label={c} active={st.currency === c} onPress={() => set({ currency: c })} />)}</View></Glass></Section>
        <Section title="Kids Mode"><Glass style={{ gap: 8 }}><T muted>Simplified, safe local learning screen. Exit requires a long-press (and parent PIN if set).</T><View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{["math", "words", "reading", "routine"].map((k) => <Chip key={k} label={k} active={st.kidsSections.includes(k)} onPress={() => set({ kidsSections: st.kidsSections.includes(k) ? st.kidsSections.filter((x) => x !== k) : [...st.kidsSections, k] })} />)}</View><Btn testID="kids-enter" label="Enter Kids Mode" onPress={() => { set({ kidsMode: true }); router.replace("/kids"); }} /></Glass></Section>
        <T v="caption" muted>Dates and times follow your device's locale. UI strings are centralized per screen for future translation.</T>
      </> : null}
      {tab === "planning" ? <Glass style={{ gap: 6 }}>
        {[["Available hours", `${st.workStart}–${st.workEnd}`], ["Sleep / rest (never scheduled)", `${st.sleepStart}–${st.sleepEnd}`], ["High-energy (demanding tasks)", `${st.highEnergyStart}–${st.highEnergyEnd}`], ["Low-energy (light tasks)", `${st.lowEnergyStart}–${st.lowEnergyEnd}`], ["Buffer", `${st.bufferMin} min`], ["Quiet hours", `${st.quietStart}–${st.quietEnd}`], ["Pomodoro", `${st.pomodoroWork}/${st.pomodoroBreak}`], ["Briefings", `${st.briefingMorning} & ${st.briefingEvening}`]].map(([a, b]) => <Row key={a} title={a} right={<T muted>{b}</T>} />)}
        <Btn testID="planning-edit" label="Edit planning preferences" onPress={timeForm} />
      </Glass> : null}
      {tab === "dashboard" ? <><T muted>Reorder, hide or show Today widgets.</T><Reorder testID="dash" list={st.dashboard} labels={DASHBOARD_WIDGETS} onChange={(l) => set({ dashboard: l })} /></> : null}
      {tab === "modules" ? <><T muted>Hide modules you don't use. Hiding never deletes data.</T><Reorder testID="mod" list={st.modules} labels={Object.fromEntries(Object.entries(MODULES).map(([k, v]) => [k, v.label]))} onChange={(l) => set({ modules: l })} /></> : null}
      {tab === "memory" ? <>
        <Glass style={{ gap: 6 }}><Row title="Agent memory" subtitle="Only stores what you explicitly save" right={<Chip testID="memory-toggle" label={st.memoryEnabled ? "On" : "Off"} active={st.memoryEnabled} onPress={() => set({ memoryEnabled: !st.memoryEnabled })} />} /></Glass>
        <Glass style={{ paddingVertical: 4 }}>{memory.map((m, i) => <View key={m.id}>{i ? <Divider /> : null}<Row title={m.value} subtitle={`${m.key} · ${m.enabled ? "active" : "disabled"}`} onPress={() => ui.form({ title: "Edit memory", initial: m, fields: [{ key: "key", label: "Type", type: "select", options: ["instruction", "study_time", "work_hours", "categories", "routine", "planning", "priority"].map((x) => ({ label: x, value: x })) }, { key: "value", label: "Preference", type: "text", required: true }, { key: "enabled", label: "Enabled", type: "toggle" }], onSubmit: (v) => { db.update("memory", m.id, v); }, onDelete: () => db.remove("memory", m.id) })} /></View>)}{!memory.length ? <T muted>No saved preferences. Tell the Agent: "remember I prefer studying in the evening".</T> : null}</Glass>
        <Btn kind="secondary" label="Add preference" icon="add" onPress={() => ui.form({ title: "New preference", fields: [{ key: "key", label: "Type", type: "select", required: true, options: ["instruction", "study_time", "work_hours", "categories", "routine", "planning", "priority"].map((x) => ({ label: x, value: x })) }, { key: "value", label: "Preference", type: "text", required: true }], onSubmit: (v) => { db.add("memory", { ...v, enabled: true }); } })} />
        {memory.length ? <Btn kind="danger" label="Delete all memory" onPress={async () => { if (await ui.confirm({ title: "Delete all memory?", message: "Removes all saved preferences.", destructive: true })) db.replace("memory", [], "Clear memory"); }} /> : null}
      </> : null}
      {tab === "privacy" ? <>
        {permRow}
        <Glass style={{ gap: 8 }}>
          <T v="headline">PIN & app lock</T>
          <T v="caption" muted>Your PIN is stored only as a salted SHA-256 hash in the Android Keystore-backed secure store.</T>
          <Btn testID="pin-set" small label={pin ? "Change PIN" : "Set PIN"} onPress={() => ui.form({ title: pin ? "Change PIN" : "Set PIN", fields: [{ key: "pin", label: "New PIN (4–8 digits)", type: "text", required: true }, { key: "confirm", label: "Confirm PIN", type: "text", required: true }], onSubmit: async (v) => { if (!/^\d{4,8}$/.test(v.pin)) return "PIN must be 4–8 digits."; if (v.pin !== v.confirm) return "PINs don't match."; if (!(await setPin(v.pin))) return "Secure storage unavailable on this device."; setPinState(true); ui.toast("PIN saved"); } })} />
          {pin ? <Row title="Lock app on launch" right={<Chip testID="applock-toggle" label={st.appLock ? "On" : "Off"} active={st.appLock} onPress={() => set({ appLock: !st.appLock })} />} /> : null}
          {pin ? <Btn small kind="ghost" label="Remove PIN" onPress={async () => { if (await ui.confirm({ title: "Remove PIN?", message: "App lock and Kids Mode protection will be disabled.", destructive: true })) { await clearPin(); set({ appLock: false }); setPinState(false); } }} /> : null}
        </Glass>
        <Glass style={{ gap: 4 }}><T v="headline">Privacy</T><T v="caption" muted>• No account, no internet, no analytics, ads or telemetry.{"\n"}• Data lives in this app's private storage, protected by Android's sandbox and full-disk/file-based device encryption.{"\n"}• Exported backups are plain JSON and NOT encrypted — store them somewhere safe.</T></Glass>
      </> : null}
      {tab === "data" ? <>
        <Glass style={{ gap: 8 }}>
          <T v="headline">Backup & restore</T>
          <T v="caption" muted>Schema v{SCHEMA_VERSION}. Backups are unencrypted JSON files you control.</T>
          <Btn testID="backup-export" label="Export full backup" icon="share-outline" onPress={async () => { try { ui.toast(await exportBackup()); } catch (e: any) { ui.toast("Export failed: " + e.message); } }} />
          <Btn testID="backup-import" kind="secondary" label="Restore from backup" icon="download-outline" onPress={async () => {
            try {
              const f = await pickText(); if (!f) return;
              let obj: any; try { obj = JSON.parse(f.text); } catch { throw new Error("File is corrupted or not JSON."); }
              const err = db.validateBackup(obj); if (err) throw new Error(err);
              const count = Object.values(obj.data).reduce((a: number, v: any) => a + v.length, 0);
              const merge = await ui.confirm({ title: `Backup from ${fmtDT(obj.exportedAt)}`, message: `${count} records. Merge keeps your current data and adds missing records (duplicates skipped). Cancel to choose Replace.`, confirmLabel: "Merge" });
              if (merge) { db.restoreBackup(obj, "merge"); ui.toast("Backup merged"); return; }
              if (await ui.confirm({ title: "Replace all data?", message: "Current data will be overwritten by the backup. Export a backup first if unsure.", destructive: true, confirmLabel: "Replace" })) { db.restoreBackup(obj, "replace"); ui.toast("Backup restored"); }
            } catch (e: any) { ui.toast("Restore failed: " + e.message); }
          }} />
        </Glass>
        <Glass style={{ gap: 8 }}>
          <T v="headline">Integrity</T>
          <Btn testID="integrity-check" small kind="secondary" label="Run data integrity check" onPress={() => { const issues = db.integrityCheck(); ui.sheet("Integrity check", <View style={{ gap: 8 }}><T>{issues.length ? `${issues.length} issue(s):\n` + issues.slice(0, 20).join("\n") : "✓ No problems found."}</T>{issues.length ? <Btn label="Repair (remove duplicates & broken links)" onPress={() => { db.repairDuplicates(); ui.closeSheet(); ui.toast("Repaired", () => db.undo()); }} /> : null}</View>); }} />
          <T v="caption" muted>{COLLECTIONS.reduce((a, c) => a + db.list(c).length, 0)} records stored locally. Undo history: {db.get().undo.length} step(s).</T>
          <Btn small kind="ghost" label="Undo last change" testID="global-undo" onPress={() => { const l = db.undo(); ui.toast(l ? "Undid: " + l : "Nothing to undo"); }} />
        </Glass>
        <Glass style={{ gap: 8, borderColor: colors.error }}>
          <T v="headline" color={colors.error}>Danger zone</T>
          <Btn testID="clear-all-data" kind="danger" label="Erase all data" onPress={async () => {
            if (!(await ui.confirm({ title: "Erase ALL data?", message: "Every task, event, note and setting on this device will be permanently deleted. This cannot be undone.", destructive: true, confirmLabel: "Continue" }))) return;
            ui.form({ title: "Type DELETE to confirm", fields: [{ key: "c", label: "Confirmation", type: "text", required: true }], submitLabel: "Erase everything", onSubmit: async (v) => { if (v.c !== "DELETE") return "Type DELETE exactly."; await db.clearAll(); ui.toast("All data erased"); router.replace("/"); } });
          }} />
        </Glass>
      </> : null}
      {tab === "about" ? <>
      <Glass testID="settings-about-brand" style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <BrandLogo size={64} testID="settings-brand-logo" />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="title">TIME AI</T>
          <T v="caption" muted>Your private, on-device time & life planner</T>
          <T v="caption" muted>Version {Constants.expoConfig?.version ?? "1.0.0"}</T>
        </View>
      </Glass>
      <Glass style={{ gap: 4 }}>
        <Row testID="settings-privacy-link" title="Privacy Policy" left={<IconBtn label="Privacy" icon="shield-checkmark-outline" onPress={() => router.push("/privacy")} />} onPress={() => router.push("/privacy")} />
        <Divider />
        <Row testID="settings-terms-link" title="Terms & Conditions" left={<IconBtn label="Terms" icon="document-text-outline" onPress={() => router.push("/terms")} />} onPress={() => router.push("/terms")} />
        <Divider />
        <Row testID="settings-support-link" title="Contact support" subtitle={SUPPORT_EMAIL} left={<IconBtn label="Email" icon="mail-outline" onPress={() => emailSupport()} />} onPress={() => emailSupport()} />
      </Glass>
      <Glass style={{ gap: 6 }}>
        <T v="headline">TIME AI · honest limitations</T>
        <T v="caption" muted>{[
          "• AI Agent: deterministic on-device rule engine and planner — not a large language model. It understands specific command patterns and shows every change before applying.",
          "• No generative model, OCR engine, PDF parser or offline speech recognizer is bundled. Import text files instead; use keyboard dictation for voice (may require internet depending on your device).",
          "• Text-to-speech output is not included in this build.",
          "• Reminders/alarms use OS-scheduled local notifications. Android battery optimisation, Doze and Do Not Disturb may delay them; exact alarms and full-screen alarm UI need a native build.",
          "• Automations run while the app is open/foregrounded, not when fully closed.",
          "• Home-screen widgets require a native Android build with a widget extension; use Pinned items on Today as the in-app alternative.",
          "• Readiness and completion dates are estimates from your own recorded evidence and are labelled as such.",
        ].join("\n")}</T>
      </Glass></> : null}
    </Screen>
  );
}
