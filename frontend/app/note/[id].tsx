import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, Item, useCol } from "@/src/store/db";
import { radius, spacing, type, useTheme } from "@/src/theme";
import { notesToCards, notesToQuestions } from "@/src/engine/learning";
import { Backdrop, Btn, Check, Chip, IconBtn, Row, T } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

export default function NoteEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets(); const { colors } = useTheme(); const ui = useUI();
  useCol("notes");
  const n = db.find("notes", id);
  const [title, setTitle] = useState(n?.title ?? "");
  const [body, setBody] = useState(n?.body ?? "");
  const [item, setItem] = useState("");
  const timer = useRef<any>(null);
  useEffect(() => { // autosave
    if (!n) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (title !== n.title || body !== n.body) db.update("notes", n.id, { title, body }, "Edit note"); }, 500);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);
  if (!n) return <View style={{ flex: 1, backgroundColor: colors.surface, padding: 40 }}><T>Note not found.</T><Btn label="Back" onPress={() => router.back()} /></View>;
  const cl = n.checklist ?? [];
  // [[Title]] wiki links → backlinks
  const links = [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
  const backlinks = db.list("notes").filter((x) => x.id !== n.id && (x.body ?? "").includes(`[[${n.title}]]`));
  const subjects = db.list("subjects");
  const meta = () => ui.form({ title: "Note details", initial: n, fields: [
    { key: "folder", label: "Folder", type: "text" }, { key: "tags", label: "Tags", type: "tags" },
    { key: "workspaceId", label: "Workspace", type: "select", options: db.list("workspaces").map((w) => ({ label: w.name, value: w.id })) },
    { key: "projectId", label: "Project", type: "select", options: db.list("projects").map((w) => ({ label: w.title, value: w.id })) },
    { key: "goalId", label: "Goal", type: "select", options: db.list("goals").map((w) => ({ label: w.title, value: w.id })) },
    { key: "areaId", label: "Life area", type: "select", options: db.list("lifeAreas").map((w) => ({ label: w.name, value: w.id })) },
  ], onSubmit: (v) => { db.update("notes", n.id, v); } });
  const toStudy = () => {
    const qs = notesToQuestions(body); const cards = notesToCards(body);
    if (!subjects.length) return ui.toast("Create a subject in Student Mode first.");
    ui.sheet("Generate study material", (
      <View style={{ gap: 8 }}>
        <T muted>Local text rules (no AI model): "Term: definition" lines → flashcards; sentences → fill-in-the-blank questions. Review before studying.</T>
        <T>{cards.length} flashcard(s), {qs.length} question(s) found.</T>
        <T v="caption" muted>Choose subject:</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{subjects.map((s) => <Chip key={s.id} testID={`gen-subject-${s.id}`} label={s.name} onPress={() => {
          let topic = db.list("topics").find((t) => t.subjectId === s.id && t.name === n.title);
          if (!topic) topic = db.add("topics", { subjectId: s.id, name: n.title, difficulty: 3, confidence: 3, estMin: 60, prereqIds: [], chapter: "From notes" });
          if (cards.length) db.addMany("flashcards", cards.map((c) => ({ ...c, subjectId: s.id, topicId: topic!.id, noteId: n.id })));
          if (qs.length) db.addMany("questions", qs.map((q) => ({ ...q, subjectId: s.id, topicId: topic!.id, noteId: n.id })));
          ui.closeSheet(); ui.toast(`Added ${cards.length} cards & ${qs.length} questions`);
        }} />)}</View>
      </View>));
  };
  const input = [type.body, { color: colors.onSurface }];
  return (
    <View testID="note-editor" style={{ flex: 1, backgroundColor: colors.surface }}>
      <Backdrop />
      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, flexDirection: "row", gap: 8, alignItems: "center", paddingBottom: 8 }}>
        <IconBtn testID="note-back-button" label="Back" icon="chevron-back" onPress={() => { db.update("notes", n.id, { title, body }, "Edit note"); router.back(); }} />
        <View style={{ flex: 1 }} />
        <IconBtn testID="note-pin-button" label="Pin" icon={n.pinned ? "pin" : "pin-outline"} onPress={() => db.update("notes", n.id, { pinned: !n.pinned })} />
        <IconBtn testID="note-fav-button" label="Favorite" icon={n.favorite ? "star" : "star-outline"} onPress={() => db.update("notes", n.id, { favorite: !n.favorite })} />
        <IconBtn testID="note-meta-button" label="Details" icon="pricetags-outline" onPress={meta} />
        <IconBtn testID="note-more-button" label="More" icon="ellipsis-horizontal" onPress={() => ui.sheet("Note actions", (
          <View style={{ gap: 8 }}>
            <Btn kind="secondary" label="Generate flashcards & quiz" icon="school-outline" testID="note-to-quiz-button" onPress={() => { ui.closeSheet(); setTimeout(toStudy, 250); }} />
            <Btn kind="secondary" label="Duplicate" icon="copy-outline" testID="note-duplicate-button" onPress={() => { const { id: _i, createdAt, updatedAt, ...rest } = n; const c = db.add("notes", { ...rest, title: title + " (copy)", body }); ui.closeSheet(); router.replace(`/note/${c.id}` as any); }} />
            <Btn kind="secondary" label={n.archived ? "Unarchive" : "Archive"} icon="archive-outline" testID="note-archive-button" onPress={() => { db.update("notes", n.id, { archived: !n.archived }); ui.closeSheet(); }} />
            <Btn kind="danger" label="Move to trash" icon="trash-outline" testID="note-delete-button" onPress={() => { db.remove("notes", n.id); ui.closeSheet(); router.back(); ui.toast("Note moved to trash", () => db.undo()); }} />
            {n.deleted ? <Btn kind="danger" label="Delete permanently" onPress={async () => { if (await ui.confirm({ title: "Delete forever?", message: "This cannot be undone after leaving the app.", destructive: true })) { db.purge("notes", n.id); router.back(); } }} /> : null}
          </View>))} />
      </View>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <TextInput testID="note-title-input" value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={colors.muted} style={[type.title, { color: colors.onSurface }]} />
        <T v="caption" muted>{n.folder || "General"}{(n.tags ?? []).length ? " · " + n.tags.map((t: string) => "#" + t).join(" ") : ""} · autosaved locally · use [[Note title]] to link</T>
        <TextInput testID="note-body-input" value={body} onChangeText={setBody} multiline placeholder="Start writing… (Markdown-style: # heading, - list, **bold**)" placeholderTextColor={colors.muted} style={[input, { minHeight: 220, textAlignVertical: "top", lineHeight: 22 }]} />
        <T v="headline">Checklist</T>
        {cl.map((c: Item) => <Row key={c.id} title={c.title} done={c.done} strike left={<Check testID={`note-check-${c.id}`} label={c.title} on={c.done} onPress={() => db.update("notes", n.id, { checklist: cl.map((x: any) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} />} right={<IconBtn label="Remove" icon="close" onPress={() => db.update("notes", n.id, { checklist: cl.filter((x: any) => x.id !== c.id) })} />} />)}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput testID="note-checklist-input" value={item} onChangeText={setItem} placeholder="Add checklist item" placeholderTextColor={colors.muted} style={[type.body, { flex: 1, height: 44, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: 12, color: colors.onSurface }]} />
          <Btn small label="Add" testID="note-checklist-add" onPress={() => { if (!item.trim()) return; db.update("notes", n.id, { checklist: [...cl, { id: Date.now().toString(36), title: item.trim(), done: false }] }); setItem(""); }} />
        </View>
        {links.length || backlinks.length ? <View style={{ gap: 4 }}>
          <T v="headline">Links</T>
          {links.map((l) => { const t = db.list("notes").find((x) => x.title === l); return <Row key={l} title={"→ " + l} subtitle={t ? "linked note" : "not found — tap to create"} onPress={() => { const target = t ?? db.add("notes", { title: l, body: "", tags: [], folder: n.folder }); router.push(`/note/${target.id}` as any); }} />; })}
          {backlinks.map((b) => <Row key={b.id} title={"← " + b.title} subtitle="backlink" onPress={() => router.push(`/note/${b.id}` as any)} />)}
        </View> : null}
      </KeyboardAwareScrollView>
    </View>
  );
}
