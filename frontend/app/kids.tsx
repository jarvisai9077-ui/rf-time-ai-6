import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, useCol, useSettings } from "@/src/store/db";
import { radius, spacing, type, useTheme } from "@/src/theme";
import { checkPin, hasPin } from "@/src/security";
import { todayKey } from "@/src/engine/time";
import { Backdrop, Btn, Chip, Glass, Icon, T } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

const SECTIONS: Record<string, { label: string; icon: string }> = { math: { label: "Maths", icon: "calculator" }, words: { label: "Words", icon: "text" }, reading: { label: "Reading", icon: "book" }, routine: { label: "My routine", icon: "sunny" } };

function mathQ(level: number) {
  const max = level === 1 ? 10 : level === 2 ? 20 : 50;
  const a = Math.floor(Math.random() * max) + 1, b = Math.floor(Math.random() * max) + 1;
  const op = level === 1 ? "+" : ["+", "-", "×"][Math.floor(Math.random() * (level === 3 ? 3 : 2))];
  const [x, y] = op === "-" && b > a ? [b, a] : [a, b];
  return { q: `${x} ${op} ${y}`, a: op === "+" ? x + y : op === "-" ? x - y : x * y };
}

export default function Kids() {
  const insets = useSafeAreaInsets(); const { colors } = useTheme(); const ui = useUI(); const st = useSettings();
  const log = useCol("kidsLog"); const routines = useCol("routines"); const cards = useCol("flashcards");
  const [sec, setSec] = useState<string | null>(null);
  const [level, setLevel] = useState(1);
  const [q, setQ] = useState(() => mathQ(1)); const [ans, setAns] = useState(""); const [fb, setFb] = useState("");
  const words = useMemo(() => cards.filter((c) => (c.tags ?? []).includes("kids") || c.kids), [cards]);
  const [wi, setWi] = useState(0); const [show, setShow] = useState(false);
  const stars = log.filter((l) => l.date === todayKey()).reduce((a, l) => a + (l.stars ?? 0), 0);
  const award = (activity: string, n = 1) => db.add("kidsLog", { activity, stars: n, date: todayKey() });
  const exit = async () => {
    if (await hasPin()) {
      ui.form({ title: "Parent PIN", fields: [{ key: "pin", label: "PIN", type: "text", required: true }], onSubmit: async (v) => { if (!(await checkPin(v.pin))) return "Incorrect PIN"; db.setSettings({ kidsMode: false }); router.replace("/"); } });
    } else { db.setSettings({ kidsMode: false }); router.replace("/"); }
  };
  const big = { fontSize: 44, fontWeight: "800" as const, color: colors.onSurface, textAlign: "center" as const };
  return (
    <View testID="kids-screen" style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.lg }}>
      <Backdrop />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {sec ? <Pressable testID="kids-back" accessibilityLabel="Back" onPress={() => setSec(null)} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.glass, alignItems: "center", justifyContent: "center" }}><Icon name="arrow-back" size={28} /></Pressable> : null}
        <View style={{ flex: 1 }}><T v="largeTitle">{sec ? SECTIONS[sec].label : "Hi there! 👋"}</T><T muted testID="kids-stars">⭐ {stars} star(s) today</T></View>
        <Pressable testID="kids-exit" accessibilityLabel="Parent exit" onLongPress={exit} onPress={() => ui.toast("Grown-ups: long-press to exit Kids Mode")} style={{ padding: 10 }}><Icon name="lock-closed" color={colors.muted} /></Pressable>
      </View>
      {!sec ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          {st.kidsSections.filter((k) => SECTIONS[k]).map((k) => (
            <Pressable key={k} testID={`kids-section-${k}`} onPress={() => setSec(k)} style={({ pressed }) => ({ width: "47%", flexGrow: 1, aspectRatio: 1, borderRadius: radius.xl, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", gap: 10, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <Icon name={SECTIONS[k].icon} size={52} color={colors.brandPrimary} /><Text style={{ fontSize: 22, fontWeight: "800", color: colors.onBrandTertiary }}>{SECTIONS[k].label}</Text>
            </Pressable>))}
        </View>
      ) : null}
      {sec === "math" ? <Glass style={{ gap: spacing.lg, alignItems: "center" }}>
        <View style={{ flexDirection: "row", gap: 8 }}>{[1, 2, 3].map((l) => <Chip key={l} label={["Easy", "Medium", "Hard"][l - 1]} active={level === l} onPress={() => { setLevel(l); setQ(mathQ(l)); setFb(""); setAns(""); }} />)}</View>
        <Text testID="kids-math-question" style={big}>{q.q} = ?</Text>
        <TextInput testID="kids-math-answer" value={ans} onChangeText={setAns} keyboardType="number-pad" style={[big, { width: 160, backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, padding: 8 }]} />
        {fb ? <Text testID="kids-math-feedback" style={{ fontSize: 22, color: fb.startsWith("⭐") ? colors.success : colors.warning, textAlign: "center" }}>{fb}</Text> : null}
        <Btn testID="kids-math-check" label="Check" style={{ width: 200 }} onPress={() => { if (Number(ans) === q.a) { setFb("⭐ Great job!"); award("math"); setTimeout(() => { setQ(mathQ(level)); setAns(""); setFb(""); }, 900); } else setFb("Nice try! Have another go 💪"); }} />
      </Glass> : null}
      {sec === "words" ? (words.length ? <Glass style={{ gap: spacing.lg, alignItems: "center" }} onPress={() => setShow(!show)}>
        <Text style={big}>{show ? words[wi % words.length].back : words[wi % words.length].front}</Text>
        <T muted>Tap to {show ? "see the word" : "see the meaning"}</T>
        <Btn testID="kids-word-next" label="I know it! Next" onPress={() => { award("words"); setWi(wi + 1); setShow(false); }} />
      </Glass> : <Glass><T v="headline">No words yet</T><T muted>Grown-ups: add flashcards in Student Mode and mark them for kids in Settings › Kids, or use "Add kids words" below.</T>
        <Btn label="Add kids words (parent)" onPress={() => ui.form({ title: "Kids words (word: meaning per line)", fields: [{ key: "text", label: "Words", type: "multiline", required: true }], onSubmit: (v) => { const rows = String(v.text).split("\n").map((l) => l.split(":")).filter((p) => p[0]?.trim() && p[1]?.trim()); if (!rows.length) return "Use 'word: meaning' per line"; db.addMany("flashcards", rows.map(([f, b]) => ({ front: f.trim(), back: b.trim(), kids: true }))); } })} /></Glass>) : null}
      {sec === "reading" ? <Glass style={{ gap: spacing.md }}>
        <T v="title">Reading log 📚</T>
        <Btn testID="kids-read-10" label="I read for 10 minutes" onPress={() => { award("reading", 2); ui.toast("⭐⭐ Wonderful reading!"); }} />
        <Btn kind="secondary" label="I finished a book!" onPress={() => { award("reading-book", 5); ui.toast("🏆 Amazing! 5 stars"); }} />
        <T muted>Reading today: {log.filter((l) => l.date === todayKey() && l.activity.startsWith("reading")).length} time(s)</T>
      </Glass> : null}
      {sec === "routine" ? <Glass style={{ gap: spacing.sm }}>
        {(routines.find((r) => r.kind === "kids") ?? routines[0])?.steps?.map((s: any) => (
          <Pressable key={s.id} onPress={() => { const r = routines.find((x) => x.kind === "kids") ?? routines[0]; db.update("routines", r.id, { steps: r.steps.map((x: any) => (x.id === s.id ? { ...x, done: !x.done } : x)) }); if (!s.done) award("routine"); }} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60 }}>
            <Icon name={s.done ? "checkmark-circle" : "ellipse-outline"} size={34} color={s.done ? colors.success : colors.muted} /><Text style={[type.title, { color: colors.onSurface }]}>{s.title}</Text>
          </Pressable>)) ?? <T muted>Grown-ups: create a routine with type "kids" in Goals › Routines.</T>}
      </Glass> : null}
    </View>
  );
}
