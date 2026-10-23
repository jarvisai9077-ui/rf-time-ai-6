import { router } from "expo-router";
import { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, useCol } from "@/src/store/db";
import { radius, type, useTheme } from "@/src/theme";
import { fmtDay } from "@/src/engine/time";
import { pickText, saveAndShare } from "@/src/engine/io";
import { Badge, ChipRow, Empty, Fab, Glass, Icon, IconBtn, Row, Screen, T, Divider } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

const TEMPLATES: Record<string, { title: string; body: string; checklist?: string[] }> = {
  blank: { title: "Untitled note", body: "" },
  meeting: { title: "Meeting notes", body: "Attendees:\n\nAgenda:\n\nDecisions:\n\nAction items:\n" },
  journal: { title: `Journal ${new Date().toDateString()}`, body: "Today I…\n\nGrateful for:\n\nTomorrow:\n" },
  study: { title: "Revision notes", body: "Topic:\n\nKey terms:\nTerm: definition\n\nSummary:\n" },
  checklist: { title: "Checklist", body: "", checklist: ["First item"] },
};

export default function Notes() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme(); const ui = useUI();
  const notes = useCol("notes"); const raw = db.get().data.notes;
  const [f, setF] = useState<"all" | "pinned" | "favorites" | "archived" | "trash" | string>("all");
  const [q, setQ] = useState("");
  const folders = [...new Set(notes.map((n) => n.folder || "General"))];
  const tags = [...new Set(notes.flatMap((n) => n.tags ?? []))];
  const items = useMemo(() => {
    let xs = f === "trash" ? raw.filter((n) => n.deleted) : notes.filter((n) => (f === "archived" ? n.archived : !n.archived));
    if (f === "pinned") xs = xs.filter((n) => n.pinned);
    if (f === "favorites") xs = xs.filter((n) => n.favorite);
    if (f.startsWith("folder:")) xs = xs.filter((n) => (n.folder || "General") === f.slice(7));
    if (f.startsWith("tag:")) xs = xs.filter((n) => (n.tags ?? []).includes(f.slice(4)));
    if (q) xs = xs.filter((n) => (n.title + n.body + (n.tags ?? []).join(" ")).toLowerCase().includes(q.toLowerCase()));
    return [...xs].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, raw, f, q]);
  const create = (k: string) => { const t = TEMPLATES[k]; const n = db.add("notes", { title: t.title, body: t.body, checklist: (t.checklist ?? []).map((x) => ({ id: Date.now().toString(36), title: x, done: false })), tags: [], folder: f.startsWith("folder:") ? f.slice(7) : "General" }); ui.closeSheet(); router.push(`/note/${n.id}` as any); };
  return (
    <View style={{ flex: 1 }}>
      <Screen testID="notes-screen" title="Notes" subtitle={`${notes.length} notes · ${folders.length} folders`} bottomPad={insets.bottom + 100}
        right={<>
          <IconBtn testID="notes-import-button" label="Import" icon="download-outline" onPress={async () => { try { const r = await pickText(); if (!r) return; db.add("notes", { title: r.name.replace(/\.\w+$/, ""), body: r.text, tags: ["imported"], folder: "Imported" }); ui.toast("Imported note"); } catch (e: any) { ui.toast(e.message); } }} />
          <IconBtn testID="notes-export-button" label="Export" icon="share-outline" onPress={async () => { try { ui.toast(await saveAndShare("timeai-notes.md", notes.map((n) => `# ${n.title}\n\n${n.body}\n${(n.checklist ?? []).map((c: any) => `- [${c.done ? "x" : " "}] ${c.title}`).join("\n")}`).join("\n\n---\n\n"), "text/markdown")); } catch (e: any) { ui.toast(e.message); } }} />
        </>}
        header={<View>
          <TextInput testID="notes-search-input" value={q} onChangeText={setQ} placeholder="Search notes" placeholderTextColor={colors.muted} style={[type.body, { height: 40, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 14, color: colors.onSurface, marginTop: 6 }]} />
          <ChipRow testID="notes-filter" value={f} onChange={setF} options={[{ label: "All", value: "all" }, { label: "Pinned", value: "pinned" }, { label: "Favorites", value: "favorites" }, ...folders.map((x) => ({ label: "📁 " + x, value: "folder:" + x })), ...tags.map((x) => ({ label: "#" + x, value: "tag:" + x })), { label: "Archive", value: "archived" }, { label: "Trash", value: "trash" }]} />
        </View>}>
        {items.length ? <Glass style={{ paddingVertical: 4 }}>{items.map((n, i) => (
          <View key={n.id}>{i ? <Divider /> : null}
            <Row testID={`note-row-${n.id}`} title={n.title || "Untitled"} subtitle={`${fmtDay(n.updatedAt)} · ${n.folder || "General"} · ${(n.body ?? "").slice(0, 60)}`} left={<Icon name={n.pinned ? "pin" : "document-text-outline"} size={18} color={colors.brandPrimary} />}
              right={f === "trash" ? <Badge label="restore" /> : n.favorite ? <Icon name="star" size={16} color={colors.warning} /> : undefined}
              onPress={() => (f === "trash" ? (db.restore("notes", n.id), ui.toast("Note restored")) : router.push(`/note/${n.id}` as any))} />
          </View>))}</Glass> : <Empty testID="notes-empty" icon="document-text-outline" title={f === "trash" ? "Trash is empty" : "No notes"} action={f !== "trash" ? "New note" : undefined} onAction={() => create("blank")} />}
        {f === "trash" && items.length ? <T v="caption" muted>Tap a note to restore it. Notes in trash are kept until you delete them permanently from the note.</T> : null}
      </Screen>
      <Fab testID="notes-add-fab" bottom={insets.bottom + 16} onPress={() => ui.sheet("New note from template", <View style={{ gap: 4 }}>{Object.entries(TEMPLATES).map(([k, t]) => <Row key={k} testID={`note-template-${k}`} title={k[0].toUpperCase() + k.slice(1)} subtitle={t.body.slice(0, 50) || "Empty"} onPress={() => create(k)} />)}</View>)} />
    </View>
  );
}
