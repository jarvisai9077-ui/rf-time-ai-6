import { router } from "expo-router";
import { db } from "@/src/store/db";
import { taskFields, saveTask, eventFields, saveEvent } from "./forms";
import { Btn, Glass, Icon, T } from "./kit";
import { useUI } from "./overlay";
import { View, Pressable } from "react-native";
import { spacing, useTheme } from "@/src/theme";

// Universal quick actions, shared by Today, Hub and other screens.
export function useQuickActions() {
  const ui = useUI();
  const nowRounded = () => { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0); return d; };
  const actions = [
    { key: "task", label: "Task", icon: "checkbox-outline", run: () => ui.form({ title: "New task", fields: taskFields(), onSubmit: (v) => saveTask(v) }) },
    { key: "event", label: "Event", icon: "calendar-outline", run: () => { const s = nowRounded(); ui.form({ title: "New event", fields: eventFields(), initial: { start: s.toISOString(), end: new Date(s.getTime() + 3600000).toISOString(), calendarId: "personal" }, onSubmit: (v) => saveEvent(v) }); } },
    { key: "note", label: "Note", icon: "create-outline", run: () => { const n = db.add("notes", { title: "Untitled note", body: "", tags: [], folder: "General" }); router.push(`/note/${n.id}` as any); } },
    { key: "focus", label: "Focus", icon: "timer-outline", run: () => router.push("/clock?tab=focus" as any) },
    { key: "timer", label: "Timer", icon: "hourglass-outline", run: () => router.push("/clock?tab=timer" as any) },
    { key: "goal", label: "Goal", icon: "flag-outline", run: () => ui.form({ title: "New goal", fields: [{ key: "title", label: "Goal", type: "text", required: true }, { key: "target", label: "Target", type: "number" }, { key: "unit", label: "Unit", type: "text", placeholder: "books, km, %" }, { key: "deadline", label: "Deadline", type: "date" }], onSubmit: (v) => { db.add("goals", { term: "short", current: 0, target: v.target ?? 100, unit: v.unit || "%", milestones: [], progressHistory: [], ...v }); ui.toast("Goal created"); } }) },
    { key: "habit", label: "Habit", icon: "repeat-outline", run: () => router.push("/goals?tab=habits" as any) },
    { key: "study", label: "Study", icon: "school-outline", run: () => router.push("/student?tab=log" as any) },
    { key: "search", label: "Search", icon: "search-outline", run: () => router.push("/search" as any) },
    { key: "agent", label: "Agent", icon: "sparkles-outline", run: () => router.push("/agent" as any) },
    { key: "project", label: "Resume project", icon: "briefcase-outline", run: () => { const p = db.list("projects").filter((x) => x.status !== "done").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]; if (p) router.push(`/project/${p.id}` as any); else router.push("/projects" as any); } },
  ];
  return actions;
}

export function QuickGrid({ compact }: { compact?: boolean }) {
  const actions = useQuickActions();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {(compact ? actions.slice(0, 8) : actions).map((a) => (
        <Pressable key={a.key} testID={`quick-${a.key}`} accessibilityRole="button" accessibilityLabel={`Quick ${a.label}`} onPress={a.run}
          style={({ pressed }) => ({ width: "23%", flexGrow: 1, minHeight: 72, borderRadius: 16, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.7 : 1 })}>
          <Icon name={a.icon} size={22} color={colors.brandPrimary} />
          <T v="caption" numberOfLines={1}>{a.label}</T>
        </Pressable>
      ))}
    </View>
  );
}
export { Btn, Glass };
