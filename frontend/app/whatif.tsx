import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings, useCol } from "@/src/store/db";
import { useTheme } from "@/src/theme";
import { simulate } from "@/src/engine/planner";
import { durLabel, fmtDay } from "@/src/engine/time";
import { addDays } from "date-fns";
import { Badge, Chip, Glass, Screen, Section, T } from "@/src/ui/kit";

export default function WhatIf() {
  const insets = useSafeAreaInsets(); const st = useSettings(); const { colors } = useTheme();
  useCol("tasks"); useCol("events"); useCol("topics");
  const [daily, setDaily] = useState(0); const [proj, setProj] = useState(0); const [weekend, setWeekend] = useState(false); const [shift, setShift] = useState(0);
  const base = simulate({ dailyStudyMin: 0, weeklyProjectMin: 0, reserveWeekends: false, routineShiftMin: 0 }, st);
  const s = simulate({ dailyStudyMin: daily, weeklyProjectMin: proj, reserveWeekends: weekend, routineShiftMin: shift }, st);
  const Opt = ({ label, val, set, opts, unit }: any) => <View style={{ gap: 6 }}><T v="caption" muted>{label}</T><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{opts.map((o: number) => <Chip key={o} testID={`whatif-${label.split(" ")[0].toLowerCase()}-${o}`} label={o ? `${o}${unit}` : "none"} active={val === o} onPress={() => set(o)} />)}</View></View>;
  return (
    <Screen testID="whatif-screen" title="What-If Planner" subtitle="Simulations never change your real plans" bottomPad={insets.bottom + 40}>
      <Glass style={{ gap: 12 }}>
        <Opt label="Daily study added" val={daily} set={setDaily} opts={[0, 30, 60, 120]} unit="m" />
        <Opt label="Weekly project time" val={proj} set={setProj} opts={[0, 120, 300, 600]} unit="m" />
        <Opt label="Morning routine shift" val={shift} set={setShift} opts={[0, -30, 30, 60]} unit="m" />
        <View style={{ flexDirection: "row", gap: 8 }}><Chip testID="whatif-weekends" label="Reserve weekends for revision" active={weekend} onPress={() => setWeekend(!weekend)} /></View>
      </Glass>
      <Section title="Comparison (next 7 days)">
        <Glass style={{ gap: 6 }} testID="whatif-result">
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T>Free time</T><T>{durLabel(base.baseFree)} → <T color={s.scenarioFree < 0 ? colors.error : undefined}>{durLabel(Math.max(0, s.scenarioFree))}</T></T></View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T>Added commitments</T><T>{durLabel(s.added)}/week</T></View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T>Open task workload</T><T>{durLabel(s.taskNeed)}</T></View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T>Feasible</T><Badge label={s.feasible ? (s.scenarioFree < s.taskNeed ? "tight" : "yes") : "overbooked"} tone={s.feasible ? (s.scenarioFree < s.taskNeed ? "warning" : "success") : "error"} /></View>
          <T>Syllabus completion: {s.syllabusDays === null ? "add daily study or reserve weekends to estimate" : `~${s.syllabusDays} days → ${fmtDay(addDays(new Date(), s.syllabusDays))} (${durLabel(s.topicNeed)} remaining)`}</T>
          <T>Tasks clear in: {s.taskWeeks === null ? "not feasible with remaining free time" : s.taskWeeks < 1 ? "this week" : `~${s.taskWeeks.toFixed(1)} weeks`}</T>
        </Glass>
      </Section>
      <Section title="Assumptions & uncertainty">
        <Glass style={{ gap: 4 }}>{s.assumptions.map((a, i) => <T key={i} v="caption" muted>• {a}</T>)}<T v="caption" muted>• Estimates are ranges in practice; real life varies ±20–30%.</T></Glass>
      </Section>
    </Screen>
  );
}
