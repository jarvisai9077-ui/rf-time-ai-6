import { router } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, useCol } from "@/src/store/db";
import { fmtDay } from "@/src/engine/time";
import { Badge, Empty, Fab, Glass, Progress, Screen, T, Btn } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

export const PROJECT_TEMPLATES: Record<string, string[]> = {
  "School assignment": ["Read the brief", "Research sources", "Outline", "Write draft", "Proofread", "Submit"],
  "Event planning": ["Set budget", "Pick date & venue", "Send invites", "Arrange food", "Day-of checklist"],
  "Software feature": ["Spec", "Design", "Implement", "Test", "Release"],
  "Home improvement": ["Measure & plan", "Buy materials", "Prep area", "Do the work", "Clean up"],
};

export function projectForm(ui: ReturnType<typeof useUI>, p?: any) {
  ui.form({ title: p ? "Edit project" : "New project", initial: p ?? { status: "active" }, fields: [
    { key: "title", label: "Name", type: "text", required: true }, { key: "description", label: "Description", type: "multiline" },
    { key: "status", label: "Status", type: "select", options: ["active", "on hold", "done"].map((x) => ({ label: x, value: x })) },
    { key: "deadline", label: "Deadline", type: "date" },
    { key: "workspaceId", label: "Workspace", type: "select", options: db.list("workspaces").map((w) => ({ label: w.name, value: w.id })) },
    { key: "goalId", label: "Goal", type: "select", options: db.list("goals").map((w) => ({ label: w.title, value: w.id })) },
    { key: "areaId", label: "Life area", type: "select", options: db.list("lifeAreas").map((w) => ({ label: w.name, value: w.id })) },
    ...(p ? [] : [{ key: "template", label: "Template", type: "select" as const, options: Object.keys(PROJECT_TEMPLATES).map((k) => ({ label: k, value: k })) }]),
  ], onSubmit: (v) => {
    if (p) return void db.update("projects", p.id, v);
    const { template, ...rest } = v;
    const pr = db.add("projects", { milestones: [], ...rest });
    if (template) {
      const made = db.addMany("tasks", PROJECT_TEMPLATES[template].map((t) => ({ title: t, projectId: pr.id, status: "todo", priority: 3, subtasks: [], tags: [], dependsOn: [] })));
      // chain dependencies in order (made[] is in template order)
      made.forEach((t, i) => i > 0 && db.update("tasks", t.id, { dependsOn: [made[i - 1].id] }, undefined, true));
    }
    router.push(`/project/${pr.id}` as any);
  }, onDelete: p ? () => { db.remove("projects", p.id); router.back(); ui.toast("Project deleted", () => db.undo()); } : undefined });
}

export default function Projects() {
  const insets = useSafeAreaInsets(); const ui = useUI();
  const projects = useCol("projects"); const tasks = useCol("tasks");
  return (
    <View style={{ flex: 1 }}>
      <Screen testID="projects-screen" title="Projects" subtitle={`${projects.filter((p) => p.status !== "done").length} active`} bottomPad={insets.bottom + 100}>
        {projects.length ? projects.map((p) => {
          const ts = tasks.filter((t) => t.projectId === p.id); const d = ts.filter((t) => t.status === "done").length;
          return (
            <Glass key={p.id} testID={`project-card-${p.id}`} onPress={() => router.push(`/project/${p.id}` as any)} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T v="headline" style={{ flex: 1 }}>{p.title}</T><Badge label={p.status ?? "active"} tone={p.status === "done" ? "success" : "muted"} /></View>
              <Progress value={ts.length ? d / ts.length : 0} />
              <T v="caption" muted>{d}/{ts.length} tasks{p.deadline ? ` · due ${fmtDay(p.deadline)}` : ""}{p.workspaceId ? ` · ${db.find("workspaces", p.workspaceId)?.name ?? ""}` : ""}</T>
            </Glass>);
        }) : <Empty testID="projects-empty" icon="briefcase-outline" title="No projects" body="Start from a template or ask the Agent to break a project into tasks." action="New project" onAction={() => projectForm(ui)} />}
        <Btn kind="ghost" label="Ask Agent to break down a project" onPress={() => router.push("/agent")} />
      </Screen>
      <Fab testID="projects-add-fab" bottom={insets.bottom + 16} onPress={() => projectForm(ui)} />
    </View>
  );
}
