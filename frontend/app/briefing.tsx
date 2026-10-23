import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, useCol, useSettings } from "@/src/store/db";
import { eveningBriefing, morningBriefing } from "@/src/engine/reports";
import { scheduleReminder } from "@/src/engine/notify";
import { todayKey } from "@/src/engine/time";
import { Btn, ChipRow, Glass, Screen, T } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

export default function Briefing() {
  const insets = useSafeAreaInsets(); const ui = useUI(); const st = useSettings();
  useCol("tasks"); useCol("events"); useCol("habits");
  const [tab, setTab] = useState<"morning" | "evening">(new Date().getHours() >= 16 ? "evening" : "morning");
  const text = tab === "morning" ? morningBriefing() : eveningBriefing();
  const schedule = async () => {
    const hm = tab === "morning" ? st.briefingMorning : st.briefingEvening;
    if (!db.list("automations").some((a) => a.action === "briefing_" + tab)) db.add("automations", { name: `${tab} briefing`, trigger: "daily_time", triggerValue: hm, condition: "always", action: "briefing_" + tab, enabled: true, runs: 0 });
    const [h, m] = hm.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1);
    const r = await scheduleReminder(`Your ${tab} briefing is ready`, d, { kind: "briefing" });
    ui.toast(r.error ? "Daily automation created (notification: " + r.error + ")" : `Daily ${tab} briefing at ${hm}`);
  };
  return (
    <Screen testID="briefing-screen" title="Briefings" subtitle="Generated from your stored data only" bottomPad={insets.bottom + 40}
      header={<ChipRow testID="briefing-tab" value={tab} onChange={setTab} options={[{ label: "Morning", value: "morning" }, { label: "Evening", value: "evening" }]} />}>
      <Glass testID="briefing-text"><T>{text}</T></Glass>
      {tab === "evening" ? <Btn kind="secondary" label="Add reflection note" testID="briefing-reflect" onPress={() => ui.form({ title: "Evening reflection", fields: [{ key: "note", label: "Reflection", type: "multiline", required: true }], onSubmit: (v) => { db.add("checkins", { date: todayKey(), type: "evening", note: v.note }); db.add("notes", { title: "Reflection " + todayKey(), body: text + "\n\nReflection:\n" + v.note, folder: "Journal", tags: ["reflection"] }); ui.toast("Saved"); } })} /> : null}
      <Btn testID="briefing-schedule" label={`Deliver daily at ${tab === "morning" ? st.briefingMorning : st.briefingEvening}`} icon="alarm-outline" onPress={schedule} />
      <Btn kind="ghost" label="Save as note" onPress={() => { db.add("notes", { title: `${tab} briefing ${todayKey()}`, body: text, folder: "Briefings", tags: ["briefing"] }); ui.toast("Saved to notes"); }} />
      <View><T v="caption" muted>Change delivery times in Settings › Planning.</T></View>
    </Screen>
  );
}
