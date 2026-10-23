import { router } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, Item, useCol } from "@/src/store/db";
import { radius, type, useTheme } from "@/src/theme";
import { Btn, Empty, Fab, Glass, Icon, IconBtn, Row, Screen, T, Divider } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

const ICONS = ["albums", "school", "briefcase", "home", "heart", "code-slash", "book", "rocket"];

export default function Workspaces() {
  const insets = useSafeAreaInsets(); const ui = useUI(); const { colors } = useTheme();
  const ws = useCol("workspaces"); const notes = useCol("notes"); const projects = useCol("projects"); const dbs = useCol("databases"); const tasks = useCol("tasks");
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const form = (w?: Item) => ui.form({ title: w ? "Edit workspace" : "New workspace", initial: w, fields: [{ key: "name", label: "Name", type: "text", required: true }, { key: "description", label: "Description", type: "multiline" }, { key: "icon", label: "Icon", type: "select", options: ICONS.map((i) => ({ label: i, value: i })) }], onSubmit: (v) => { if (w) db.update("workspaces", w.id, v); else db.add("workspaces", { icon: "albums", ...v }); }, onDelete: w ? () => { db.remove("workspaces", w.id); ui.toast("Workspace deleted (contents kept)", () => db.undo()); } : undefined });
  const sorted = [...ws].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)));
  return (
    <View style={{ flex: 1 }}>
      <Screen testID="workspaces-screen" title="Workspaces" subtitle={`${ws.length} workspaces`} bottomPad={insets.bottom + 100} right={<IconBtn label="Sort" icon="swap-vertical" testID="ws-sort" onPress={() => setSort(sort === "recent" ? "name" : "recent")} />}>
        {sorted.length ? sorted.map((w) => {
          const content = [...projects.filter((p) => p.workspaceId === w.id).map((p) => ({ t: p.title, icon: "briefcase", r: `/project/${p.id}`, k: "project" })), ...notes.filter((n) => n.workspaceId === w.id).map((n) => ({ t: n.title, icon: "document-text", r: `/note/${n.id}`, k: "note" })), ...dbs.filter((d) => d.workspaceId === w.id).map((d) => ({ t: d.name, icon: "grid", r: `/database/${d.id}`, k: "database" })), ...tasks.filter((t) => t.workspaceId === w.id || (t.projectId && projects.find((p) => p.id === t.projectId)?.workspaceId === w.id)).map((t) => ({ t: t.title, icon: "checkbox-outline", r: "/tasks", k: "task" }))]
            .filter((c) => !q || c.t.toLowerCase().includes(q.toLowerCase()));
          const isOpen = open === w.id;
          return (
            <Glass key={w.id} testID={`workspace-card-${w.id}`} style={{ gap: 8 }}>
              <Row title={w.name} subtitle={`${w.description ?? ""} · ${content.length} items`} left={<View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}><Icon name={w.icon ?? "albums"} color={colors.brandPrimary} /></View>} onPress={() => setOpen(isOpen ? null : w.id)} right={<IconBtn label="Edit" icon="ellipsis-horizontal" onPress={() => form(w)} />} />
              {isOpen ? <>
                <TextInput testID="ws-search-input" value={q} onChangeText={setQ} placeholder="Search in workspace" placeholderTextColor={colors.muted} style={[type.body, { height: 40, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 14, color: colors.onSurface }]} />
                {content.map((c, i) => <View key={i}>{i ? <Divider /> : null}<Row title={c.t} subtitle={c.k} left={<Icon name={c.icon} size={18} color={colors.brandPrimary} />} onPress={() => router.push(c.r as any)} /></View>)}
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  <Btn small kind="secondary" label="Note" icon="add" testID="ws-add-note" onPress={() => { const n = db.add("notes", { title: "Untitled", body: "", workspaceId: w.id, folder: w.name, tags: [] }); router.push(`/note/${n.id}` as any); }} />
                  <Btn small kind="secondary" label="Project" icon="add" onPress={() => { const p = db.add("projects", { title: "New project", workspaceId: w.id, status: "active", milestones: [] }); router.push(`/project/${p.id}` as any); }} />
                  <Btn small kind="secondary" label="Database" icon="add" onPress={() => { const d = db.add("databases", { name: "New database", workspaceId: w.id, fields: [{ id: "f1", name: "Name", type: "text" }], records: [], views: [] }); router.push(`/database/${d.id}` as any); }} />
                  <Btn small kind="ghost" label={w.pinned ? "Unpin" : "Pin"} onPress={() => db.update("workspaces", w.id, { pinned: !w.pinned })} />
                </View>
              </> : null}
            </Glass>);
        }) : <Empty testID="workspaces-empty" icon="albums-outline" title="No workspaces" body="Group projects, notes, tasks and databases (e.g. School, Work, Home)." action="New workspace" onAction={() => form()} />}
      </Screen>
      <Fab testID="workspaces-add-fab" bottom={insets.bottom + 16} onPress={() => form()} />
    </View>
  );
}
