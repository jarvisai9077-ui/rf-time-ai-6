import { router } from "expo-router";
import { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Col, db, useSettings } from "@/src/store/db";
import { radius, type, useTheme } from "@/src/theme";
import { Chip, ChipRow, Divider, Empty, Glass, Icon, Row, Screen, T } from "@/src/ui/kit";

const SOURCES: { col: Col; label: string; icon: string; title: (i: any) => string; text: (i: any) => string; route: (i: any) => string }[] = [
  { col: "notes", label: "Notes", icon: "document-text-outline", title: (i) => i.title, text: (i) => `${i.body} ${(i.tags ?? []).join(" ")} ${i.folder}`, route: (i) => `/note/${i.id}` },
  { col: "tasks", label: "Tasks", icon: "checkbox-outline", title: (i) => i.title, text: (i) => `${i.notes ?? ""} ${(i.tags ?? []).join(" ")}`, route: () => "/tasks" },
  { col: "events", label: "Events", icon: "calendar-outline", title: (i) => i.title, text: (i) => `${i.location ?? ""} ${i.description ?? ""}`, route: () => "/calendar" },
  { col: "goals", label: "Goals", icon: "flag-outline", title: (i) => i.title, text: (i) => i.notes ?? "", route: () => "/goals" },
  { col: "projects", label: "Projects", icon: "briefcase-outline", title: (i) => i.title, text: (i) => i.description ?? "", route: (i) => `/project/${i.id}` },
  { col: "workspaces", label: "Workspaces", icon: "albums-outline", title: (i) => i.name, text: (i) => i.description ?? "", route: () => "/workspaces" },
  { col: "databases", label: "Records", icon: "grid-outline", title: (i) => i.name, text: (i) => JSON.stringify((i.records ?? []).map((r: any) => r.values)), route: (i) => `/database/${i.id}` },
  { col: "topics", label: "Topics", icon: "school-outline", title: (i) => i.name, text: (i) => `${i.chapter ?? ""} ${i.summary ?? ""}`, route: () => "/student?tab=subjects" },
  { col: "flashcards", label: "Flashcards", icon: "albums-outline", title: (i) => i.front, text: (i) => i.back, route: () => "/student?tab=cards" },
  { col: "admin", label: "Life admin", icon: "file-tray-full-outline", title: (i) => i.title, text: (i) => i.description ?? "", route: () => "/admin" },
  { col: "lists", label: "Lists", icon: "list-outline", title: (i) => i.title, text: (i) => i.list, route: () => "/family" },
];

export default function Search() {
  const insets = useSafeAreaInsets(); const { colors } = useTheme(); const st = useSettings();
  const [q, setQ] = useState(""); const [f, setF] = useState("all");
  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const out: { s: typeof SOURCES[0]; i: any; score: number }[] = [];
    for (const s of SOURCES) {
      if (f !== "all" && f !== s.col) continue;
      for (const i of db.list(s.col)) {
        const t = (s.title(i) ?? "").toLowerCase(); const body = (s.text(i) ?? "").toLowerCase();
        let score = 0;
        for (const term of terms) { if (t.includes(term)) score += t.startsWith(term) ? 6 : 4; else if (body.includes(term)) score += 1; else { score = 0; break; } }
        if (score) out.push({ s, i, score: score + (Date.now() - new Date(i.updatedAt).getTime() < 7 * 86400000 ? 1 : 0) });
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 60);
  }, [q, f]);
  const commit = () => { if (q.trim()) db.setSettings({ recentSearches: [q.trim(), ...st.recentSearches.filter((x) => x !== q.trim())].slice(0, 8) }); };
  return (
    <Screen testID="search-screen" title="Search" subtitle="Local keyword index across all modules" bottomPad={insets.bottom + 40}
      header={<View>
        <TextInput testID="search-input" autoFocus value={q} onChangeText={setQ} onSubmitEditing={commit} placeholder="Search everything…" placeholderTextColor={colors.muted} returnKeyType="search" style={[type.body, { height: 44, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 16, color: colors.onSurface, marginTop: 6 }]} />
        <ChipRow testID="search-filter" value={f} onChange={setF} options={[{ label: "All", value: "all" }, ...SOURCES.map((s) => ({ label: s.label, value: s.col }))]} />
      </View>}>
      {!q ? <>
        {st.recentSearches.length ? <><T v="caption" muted>RECENT</T><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{st.recentSearches.map((r) => <Chip key={r} label={r} icon="time-outline" onPress={() => setQ(r)} />)}</View></> : null}
        <T v="caption" muted>Semantic search/embeddings need an on-device model, which isn't bundled; keyword ranking (title matches first, then content, recency boost) is used.</T>
      </> : results.length ? <Glass style={{ paddingVertical: 4 }}>{results.map((r, n) => <View key={r.s.col + r.i.id}>{n ? <Divider /> : null}<Row testID={`search-result-${r.i.id}`} title={r.s.title(r.i) || "Untitled"} subtitle={`${r.s.label} · ${(r.s.text(r.i) ?? "").slice(0, 70)}`} left={<Icon name={r.s.icon} size={18} color={colors.brandPrimary} />} onPress={() => { commit(); router.push(r.s.route(r.i) as any); }} /></View>)}</Glass>
        : <Empty testID="search-empty" icon="search-outline" title="No matches" body="Try fewer or different words." />}
    </Screen>
  );
}
