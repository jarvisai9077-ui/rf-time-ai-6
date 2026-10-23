import { useRef, useState } from "react";
import { FlatList, Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { usesNativeTabs } from "@/src/navigation";
import { interpret } from "@/src/engine/agent";
import { Action, enqueue, runQueued, undoQueued, cancelQueued, ACTION_INFO } from "@/src/engine/actions";
import { db, Item, useCol } from "@/src/store/db";
import { radius, spacing, type, useTheme } from "@/src/theme";
import { Backdrop, Badge, Btn, Chip, Icon, IconBtn, T } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

const SUGGESTIONS = ["plan my day", "what's free today", "schedule two hours of revision before friday", "move unfinished tasks", "weekly review", "what should I study", "show conflicts", "help"];

function Bubble({ m }: { m: Item }) {
  const { colors } = useTheme();
  const ui = useUI();
  const queue = useCol("queue");
  const mine = m.role === "user";
  const qs = (m.queueIds ?? []).map((id: string) => queue.find((q) => q.id === id)).filter(Boolean) as Item[];
  const pending = qs.filter((q) => q.status === "pending" || q.status === "failed");
  const approveAll = async () => {
    if (qs.some((q) => q.destructive) && !(await ui.confirm({ title: "Confirm changes", message: pending.map((q) => "• " + q.label).join("\n"), confirmLabel: "Apply", destructive: true }))) return;
    let ok = 0, fail = 0;
    for (const q of pending) { const r = await runQueued(q.id); r.status === "completed" ? ok++ : fail++; }
    ui.toast(fail ? `${ok} applied, ${fail} failed — see details` : `${ok} change(s) applied`);
  };
  return (
    <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "88%", gap: 8 }}>
      <View testID={mine ? "agent-user-message" : "agent-reply-message"} style={{ backgroundColor: mine ? colors.brandPrimary : colors.glass, borderWidth: mine ? 0 : 1, borderColor: colors.glassBorder, padding: 12, borderRadius: radius.lg, borderBottomRightRadius: mine ? 4 : radius.lg, borderBottomLeftRadius: mine ? radius.lg : 4 }}>
        <Text selectable style={[type.body, { color: mine ? colors.onBrandPrimary : colors.onSurface }]}>{m.text}</Text>
      </View>
      {qs.length ? (
        <View testID="agent-action-preview" style={{ backgroundColor: colors.sheet, borderRadius: radius.md, padding: 12, gap: 8, borderWidth: 1, borderColor: colors.border }}>
          <T v="caption" muted>PROPOSED ACTIONS · nothing changes until you approve</T>
          {qs.map((q) => (
            <View key={q.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name={q.status === "completed" ? "checkmark-circle" : q.status === "failed" ? "alert-circle" : q.status === "cancelled" || q.status === "undone" ? "close-circle" : "ellipse-outline"} size={18} color={q.status === "completed" ? colors.success : q.status === "failed" ? colors.error : colors.muted} />
                <T style={{ flex: 1 }}>{q.label}</T>
                <Badge label={q.status} tone={q.status === "completed" ? "success" : q.status === "failed" ? "error" : "muted"} />
              </View>
              <T v="caption" muted>{ACTION_INFO[q.kind as keyof typeof ACTION_INFO]}{q.result ? " — " + q.result : ""}{q.error ? " — " + q.error : ""}</T>
              {q.kind === "create_events_bulk" ? q.payload.events.slice(0, 6).map((e: any, i: number) => <T key={i} v="caption" muted>   · {new Date(e.start).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} {e.title}</T>) : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                {q.status === "pending" ? <Btn small kind="ghost" label="Skip" testID={`agent-skip-${q.id}`} onPress={() => cancelQueued(q.id)} /> : null}
                {q.status === "failed" ? <Btn small kind="secondary" label="Retry" testID={`agent-retry-${q.id}`} onPress={() => runQueued(q.id)} /> : null}
                {q.status === "completed" && q.undoData ? <Btn small kind="ghost" label="Undo" testID={`agent-undo-${q.id}`} onPress={() => { try { undoQueued(q.id); ui.toast("Undone"); } catch (e: any) { ui.toast(e.message); } }} /> : null}
              </View>
            </View>
          ))}
          {pending.length ? <Btn testID="agent-approve-all-button" label={pending.length > 1 ? `Approve all (${pending.length})` : "Approve"} icon="checkmark" onPress={approveAll} /> : null}
        </View>
      ) : null}
    </View>
  );
}

export default function Agent() {
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { colors } = useTheme();
  const ui = useUI();
  const msgs = useCol("messages");
  const [text, setText] = useState("");
  const list = useRef<FlatList>(null);
  const ordered = [...msgs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || 0);
  const send = (input?: string) => {
    const q = (input ?? text).trim(); if (!q) return;
    setText("");
    db.add("messages", { role: "user", text: q }, "Agent message");
    if (/^undo$/i.test(q)) {
      const last = db.list("queue").find((x) => x.status === "completed" && x.undoData);
      let reply = "Nothing to undo.";
      if (last) { try { undoQueued(last.id); reply = `Undid: ${last.label}`; } catch (e: any) { reply = e.message; } }
      db.add("messages", { role: "agent", text: reply });
      return;
    }
    const lastTask = db.list("tasks")[0]?.title;
    const r = interpret(q, { lastTask });
    const qItems = r.actions.length ? enqueue(r.actions as Action[], "agent") : [];
    const dupNote = r.actions.length && !qItems.length ? "\n(These actions are already pending or were just applied — duplicate prevented.)" : "";
    db.add("messages", { role: "agent", text: r.text + dupNote, queueIds: qItems.map((x) => x.id) });
  };
  return (
    <View testID="agent-screen" style={{ flex: 1, backgroundColor: colors.surface }}>
      <Backdrop />
      <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.glass }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}><Icon name="sparkles" color={colors.onBrandPrimary} /></View>
        <View style={{ flex: 1 }}><T v="headline">TIME AI Agent</T><T v="caption" muted>On-device rules engine · not an LLM · works offline</T></View>
        <IconBtn testID="agent-queue-button" label="Action queue" icon="list" onPress={() => router.push("/queue")} />
        <IconBtn testID="agent-clear-button" label="Clear history" icon="trash-outline" onPress={async () => { if (await ui.confirm({ title: "Clear conversation?", message: "Deletes local chat history. Actions and data are kept.", destructive: true, confirmLabel: "Clear" })) db.replace("messages", [], "Clear chat"); }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <FlatList ref={list} inverted data={ordered} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => <Bubble m={item} />}
          ListFooterComponent={!ordered.length ? (
            <View style={{ gap: 8, marginBottom: spacing.lg }}>
              <T v="title">How can I help?</T>
              <T muted>I turn commands into previewed local actions. Nothing changes until you approve. Type "help" for all commands. Voice: use your keyboard's dictation (it may need internet depending on your device's speech engine; this app has no built-in offline speech model).</T>
            </View>) : undefined} />
        <View style={{ paddingBottom: bottomChrome + spacing.sm }}>
          <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 6 }}>
            <FlatList horizontal data={SUGGESTIONS} keyExtractor={(s) => s} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} renderItem={({ item }) => <Chip testID={`agent-suggestion-${item.replace(/\W+/g, "-")}`} label={item} onPress={() => send(item)} />} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: spacing.lg }}>
            <TextInput testID="agent-input" accessibilityLabel="Command" value={text} onChangeText={setText} placeholder='e.g. "add task Essay by friday 2h"' placeholderTextColor={colors.muted} multiline onSubmitEditing={() => send()} blurOnSubmit
              style={[type.body, { flex: 1, maxHeight: 120, minHeight: 48, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.border, borderRadius: 24, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 13, color: colors.onSurface }]} />
            <Pressable testID="agent-send-button" accessibilityLabel="Send" onPress={() => send()} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}><Icon name="arrow-up" color={colors.onBrandPrimary} /></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
