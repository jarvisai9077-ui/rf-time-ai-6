import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDays, startOfDay } from "date-fns";
import { db, Item, useCol, useSettings } from "@/src/store/db";
import { radius, spacing, type, useTheme } from "@/src/theme";
import { dueCards, mastery, notesToCards, parseSyllabus, readiness, recommendTopics, sm2, studyStreak } from "@/src/engine/learning";
import { planChunks } from "@/src/engine/planner";
import { daysUntil, durLabel, fmtDay, fmtTime, todayKey } from "@/src/engine/time";
import { pickText, saveAndShare } from "@/src/engine/io";
import { enqueue, runQueued } from "@/src/engine/actions";
import { Badge, Bars, Btn, Check, Chip, ChipRow, Divider, Empty, Glass, IconBtn, Progress, Row, Screen, Section, Stat, T } from "@/src/ui/kit";
import { CollectionList } from "@/src/ui/collection";
import { useUI } from "@/src/ui/overlay";

type Tab = "dash" | "subjects" | "cards" | "quiz" | "plan" | "log" | "profile";

export default function Student() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets(); const ui = useUI(); const { colors } = useTheme(); const st = useSettings();
  const [tab, setTab] = useState<Tab>((params.tab as Tab) ?? "dash");
  const subjects = useCol("subjects"); const topics = useCol("topics"); const cards = useCol("flashcards"); const questions = useCol("questions");
  const attempts = useCol("attempts"); const sessions = useCol("studySessions"); const exams = useCol("exams"); const assignments = useCol("assignments"); useCol("focusSessions");
  const [subj, setSubj] = useState<string>("all");
  const subjectOpts = subjects.map((s) => ({ label: s.name, value: s.id }));
  const subjName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "—";
  const tk = todayKey();
  const todayMin = sessions.filter((s) => s.date?.slice(0, 10) === tk).reduce((a, s) => a + (s.actualMin || 0), 0) + db.list("focusSessions").filter((f) => f.kind === "study" && f.start?.slice(0, 10) === tk).reduce((a, f) => a + f.minutes, 0);
  const due = dueCards();
  const recs = recommendTopics(6);
  const weak = topics.map((t) => ({ t, m: mastery(t.id) })).filter((x) => x.m.value !== null && x.m.value < 0.6);

  const subjectForm = (s?: Item) => ui.form({ title: s ? "Edit subject" : "New subject", initial: s, fields: [{ key: "name", label: "Subject", type: "text", required: true }, { key: "color", label: "Color", type: "select", options: ["#FF5E00", "#0A6CFF", "#1F9D55", "#AF52DE", "#FF2D55"].map((c) => ({ label: c, value: c })) }, { key: "goal", label: "Academic goal", type: "text" }], onSubmit: (v) => { if (s) db.update("subjects", s.id, v); else db.add("subjects", v); }, onDelete: s ? () => { db.remove("subjects", s.id); ui.toast("Subject deleted", () => db.undo()); } : undefined });
  const topicForm = (t?: Item, subjectId?: string) => ui.form({ title: t ? "Edit topic" : "New topic", initial: t ?? { subjectId, difficulty: 3, confidence: 3, estMin: 60 }, fields: [
    { key: "name", label: "Topic", type: "text", required: true }, { key: "subjectId", label: "Subject", type: "select", required: true, options: subjectOpts }, { key: "chapter", label: "Chapter", type: "text" },
    { key: "difficulty", label: "Difficulty (1–5)", type: "select", options: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n })) }, { key: "confidence", label: "Your confidence (1–5)", type: "select", options: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n })) },
    { key: "estMin", label: "Estimated study minutes", type: "number" }, { key: "prereqIds", label: "Prerequisites", type: "multiselect", options: topics.filter((x) => x.id !== t?.id).slice(0, 25).map((x) => ({ label: x.name, value: x.id })) },
    { key: "completed", label: "Covered / completed", type: "toggle" }, { key: "summary", label: "Topic summary / revision notes", type: "multiline" },
  ], onSubmit: (v) => { if (t) db.update("topics", t.id, { ...v, lastReviewed: v.completed && !t.completed ? new Date().toISOString() : t.lastReviewed }); else db.add("topics", { prereqIds: [], ...v }); }, onDelete: t ? () => { db.remove("topics", t.id); ui.toast("Topic deleted", () => db.undo()); } : undefined });

  const importSyllabus = async () => {
    if (!subjects.length) return ui.toast("Create a subject first.");
    try {
      const f = await pickText(["text/*", "application/pdf", "*/*"]); if (!f) return;
      const items = parseSyllabus(f.text);
      if (!items.length) throw new Error("No topics found. Use one topic per line or 'Chapter: topic, topic'.");
      ui.sheet("Import syllabus", <View style={{ gap: 8 }}><T>{items.length} topics found in {f.name}. Add to which subject?</T>{items.slice(0, 8).map((x, i) => <T key={i} v="caption" muted>• {x.chapter} › {x.name}</T>)}<View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{subjects.map((s) => <Chip key={s.id} label={s.name} onPress={() => { db.addMany("topics", items.map((x) => ({ ...x, subjectId: s.id, difficulty: 3, confidence: 3, estMin: 60, prereqIds: [] })), "Import syllabus"); ui.closeSheet(); ui.toast(`${items.length} topics imported`, () => db.undo()); }} />)}</View></View>);
    } catch (e: any) { ui.toast(e.message); }
  };
  const pasteSyllabus = () => ui.form({ title: "Paste syllabus", fields: [{ key: "subjectId", label: "Subject", type: "select", required: true, options: subjectOpts }, { key: "text", label: "Syllabus text", type: "multiline", required: true, placeholder: "Algebra: linear equations, quadratics\nGeometry: triangles, circles" }], onSubmit: (v) => { const items = parseSyllabus(v.text); if (!items.length) return "No topics found."; db.addMany("topics", items.map((x) => ({ ...x, subjectId: v.subjectId, difficulty: 3, confidence: 3, estMin: 60, prereqIds: [] })), "Paste syllabus"); ui.toast(`${items.length} topics added`); } });

  const genPlan = (days: number) => {
    if (!recs.length) return ui.toast("Add topics first.");
    const r = planChunks("Study", Math.min(recs.length, days) * 45, addDays(startOfDay(new Date()), days), st, 45);
    const blocks = r.blocks.map((b, i) => ({ ...b, title: `Study: ${recs[i % recs.length].t.name}`, why: recs[i % recs.length].why.join(", ") || "coverage" }));
    ui.sheet(`${days === 1 ? "Today's" : "Weekly"} study plan (preview)`, (
      <View style={{ gap: 8 }} testID="study-plan-preview">
        <T muted>Built locally from mastery evidence, exam dates, difficulty, prerequisites and your free time. Nothing is saved until you approve.</T>
        {blocks.map((b, i) => <Row key={i} title={`${fmtDay(b.start)} ${fmtTime(b.start)}–${fmtTime(b.end)} · ${b.title}`} subtitle={"why: " + b.why} />)}
        {r.notes.map((n, i) => <T key={i} v="caption" color={colors.warning}>{n}</T>)}
        {blocks.length ? <Btn testID="study-plan-approve" label="Add to calendar" onPress={async () => { const [q] = enqueue([{ kind: "create_events_bulk", label: "Study plan", payload: { events: blocks.map((b) => ({ title: b.title, start: b.start.toISOString(), end: b.end.toISOString(), calendarId: "study", category: "Study", description: "Why: " + b.why })) } }], "student"); if (q) { const res = await runQueued(q.id); ui.toast(res.status === "completed" ? "Study plan scheduled" : "Failed: " + res.error); } ui.closeSheet(); }} /> : <T>No free slots found in the window.</T>}
      </View>));
  };

  return (
    <Screen testID="student-screen" title="Student Mode" subtitle={`Streak ${studyStreak()}d · ${due.length} cards due`} bottomPad={insets.bottom + 40}
      header={<ChipRow testID="student-tab" value={tab} onChange={setTab} options={[{ label: "Dashboard", value: "dash" }, { label: "Subjects", value: "subjects" }, { label: "Flashcards", value: "cards" }, { label: "Quiz", value: "quiz" }, { label: "Planner", value: "plan" }, { label: "Log study", value: "log" }, { label: "Profile", value: "profile" }]} />}>
      {tab === "dash" ? <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Stat label="Studied today" value={durLabel(todayMin)} icon="time-outline" hint={`goal ${durLabel(st.dailyStudyGoalMin)}`} testID="student-today-min" />
          <Stat label="Syllabus done" value={topics.length ? `${Math.round((topics.filter((t) => t.completed).length / topics.length) * 100)}%` : "—"} icon="book-outline" hint={`${topics.filter((t) => t.completed).length}/${topics.length} topics`} />
        </View>
        <Section title="Recommended next" testID="student-recs">
          <Glass>{recs.length ? recs.slice(0, 4).map((r, i) => <View key={r.t.id}>{i ? <Divider /> : null}<Row title={r.t.name} subtitle={`${subjName(r.t.subjectId)} · ${r.why.join(", ") || "balanced coverage"} · practice ${r.difficultyLevel}, review in ${r.interval}d`} right={r.blocked ? <Badge label="prereq" tone="warning" /> : undefined} onPress={() => topicForm(r.t)} /></View>) : <T muted>Add subjects and topics to get recommendations.</T>}</Glass>
          <T v="caption" muted>You can override: edit a topic's confidence/difficulty or mark it covered.</T>
        </Section>
        <Section title="Upcoming exams" action="Add" onAction={() => setTab("profile")}>
          <Glass>{exams.filter((e) => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date)).map((e) => { const r = readiness(e.subjectId); return <Row key={e.id} title={`${e.title} · ${subjName(e.subjectId)}`} subtitle={`${fmtDay(e.date)} · in ${daysUntil(e.date)} days · readiness: ${r.value === null ? r.note : r.value + "% (" + r.note + ")"}`} />; })}{!exams.length ? <T muted>No exams.</T> : null}</Glass>
        </Section>
        <Section title="Homework & assignments">
          <Glass>{assignments.filter((a) => !a.done).map((a) => <Row key={a.id} title={a.title} subtitle={`${subjName(a.subjectId)} · due ${a.due ? fmtDay(a.due) : "—"}`} left={<Check label={a.title} on={false} onPress={() => db.update("assignments", a.id, { done: true })} />} />)}{!assignments.filter((a) => !a.done).length ? <T muted>Nothing pending.</T> : null}</Glass>
        </Section>
        <Section title="Subject progress & weak topics">
          <Glass style={{ gap: 10 }}>{subjects.map((s) => { const ts = topics.filter((t) => t.subjectId === s.id); return <View key={s.id} style={{ gap: 4 }}><T>{s.name} · {ts.filter((t) => t.completed).length}/{ts.length}</T><Progress value={ts.length ? ts.filter((t) => t.completed).length / ts.length : 0} color={s.color} /></View>; })}
            {weak.length ? <T v="caption" color={colors.warning}>Weak (measured &lt;60%): {weak.map((w) => w.t.name).join(", ")}</T> : <T v="caption" muted>No weak topics measured yet (take quizzes to measure).</T>}</Glass>
        </Section>
        <Section title="Study time — planned vs actual (7 days)">
          <Glass><Bars testID="study-chart" unit="m" data={Array.from({ length: 7 }, (_, i) => { const d = addDays(startOfDay(new Date()), i - 6).toISOString().slice(0, 10); const ss = sessions.filter((s) => s.date?.slice(0, 10) === d); return { label: d.slice(8), value: ss.reduce((a, s) => a + (s.actualMin || 0), 0), value2: ss.reduce((a, s) => a + (s.plannedMin || 0), 0) }; })} /><T v="caption" muted>Orange = actual, grey = planned (from logged sessions)</T></Glass>
        </Section>
        <Section title="Topic mastery map">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{topics.map((t) => { const m = mastery(t.id); return <View key={t.id} accessibilityLabel={`${t.name} ${m.value === null ? "not assessed" : Math.round(m.value * 100) + "%"}`} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: m.value === null ? colors.surfaceTertiary : m.value < 0.5 ? colors.error : m.value < 0.8 ? colors.warning : colors.success }}><T v="caption" color={m.value === null ? undefined : colors.onSuccess}>{t.name} {m.value === null ? "?" : Math.round(m.value * 100) + "%"}</T></View>; })}{!topics.length ? <T muted>No topics yet.</T> : null}</View>
          <T v="caption" muted>"?" = no evidence yet. Percentages are measured from your quizzes and flashcard reviews.</T>
        </Section>
      </> : null}

      {tab === "subjects" ? <>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Btn small testID="subject-add" label="Subject" icon="add" onPress={() => subjectForm()} />
          <Btn small kind="secondary" testID="topic-add" label="Topic" icon="add" onPress={() => subjects.length ? topicForm(undefined, subj !== "all" ? subj : subjects[0].id) : ui.toast("Create a subject first")} />
          <Btn small kind="secondary" testID="syllabus-import" label="Import .txt" icon="download-outline" onPress={importSyllabus} />
          <Btn small kind="secondary" testID="syllabus-paste" label="Paste syllabus" icon="clipboard-outline" onPress={pasteSyllabus} />
        </View>
        <T v="caption" muted>PDF/image syllabus: no offline PDF parser or OCR engine is bundled in this build — export as .txt or paste the text.</T>
        {subjects.length ? subjects.map((s) => (
          <Glass key={s.id} testID={`subject-card-${s.id}`} style={{ gap: 4 }}>
            <Row title={s.name} subtitle={s.goal} left={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color ?? colors.brandPrimary }} />} right={<IconBtn label="Edit subject" icon="ellipsis-horizontal" onPress={() => subjectForm(s)} />} />
            {Object.entries(topics.filter((t) => t.subjectId === s.id).reduce((a: any, t) => { (a[t.chapter || "General"] ||= []).push(t); return a; }, {})).map(([ch, ts]: any) => (
              <View key={ch}><T v="caption" muted style={{ marginTop: 4 }}>{ch}</T>{ts.map((t: Item) => <Row key={t.id} title={t.name} done={t.completed} subtitle={`difficulty ${t.difficulty ?? 3} · confidence ${t.confidence ?? 3}${t.lastReviewed ? " · reviewed " + fmtDay(t.lastReviewed) : ""}`} left={<Check testID={`topic-check-${t.id}`} label={t.name} on={!!t.completed} onPress={() => db.update("topics", t.id, { completed: !t.completed, lastReviewed: new Date().toISOString() })} />} onPress={() => topicForm(t)} />)}</View>))}
          </Glass>)) : <Empty testID="subjects-empty" icon="school-outline" title="No subjects yet" action="Add subject" onAction={() => subjectForm()} />}
      </> : null}

      {tab === "cards" ? <Flashcards subjects={subjects} topics={topics} cards={cards} /> : null}
      {tab === "quiz" ? <Quiz subjects={subjects} topics={topics} questions={questions} attempts={attempts} /> : null}

      {tab === "plan" ? <>
        <Glass style={{ gap: 8 }}><T v="headline">AI study planner (local)</T><T muted>Prioritises weak/unassessed topics, upcoming exams, overdue reviews and prerequisites, then fits sessions into your free time.</T>
          <View style={{ flexDirection: "row", gap: 8 }}><Btn testID="plan-today-button" label="Plan today" onPress={() => genPlan(1)} /><Btn testID="plan-week-button" kind="secondary" label="Plan this week" onPress={() => genPlan(7)} /></View></Glass>
        <Section title="Missed-session recovery">
          <Glass>{(() => { const missed = db.list("events").filter((e) => e.calendarId === "study" && new Date(e.end) < new Date() && !e.attended && new Date(e.end) > addDays(new Date(), -7)); return missed.length ? missed.map((e) => <Row key={e.id} title={e.title} subtitle={fmtDay(e.start) + " — not marked attended"} right={<View style={{ flexDirection: "row", gap: 6 }}><Btn small kind="secondary" label="Done" onPress={() => { db.update("events", e.id, { attended: true }); db.add("studySessions", { subjectId: null, topicId: null, plannedMin: (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000, actualMin: (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000, date: e.start, title: e.title }); }} /><Btn small label="Redo" onPress={() => { const r = planChunks(e.title, (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000, addDays(new Date(), 3), st); if (r.blocks[0]) { db.add("events", { title: e.title + " (recovery)", start: r.blocks[0].start.toISOString(), end: r.blocks[0].end.toISOString(), calendarId: "study" }); db.update("events", e.id, { attended: "missed" }); ui.toast(`Rescheduled to ${fmtDay(r.blocks[0].start)} ${fmtTime(r.blocks[0].start)}`, () => db.undo()); } else ui.toast("No free slot in next 3 days"); }} /></View>} />) : <T muted>No missed study sessions in the last 7 days.</T>; })()}</Glass>
        </Section>
      </> : null}

      {tab === "log" ? <CollectionList testID="study-log" col="studySessions" addLabel="Log study session" emptyTitle="No sessions logged" sort={(a, b) => (b.date ?? "").localeCompare(a.date ?? "")}
        defaults={{ date: new Date().toISOString(), plannedMin: 45 }}
        fields={[{ key: "subjectId", label: "Subject", type: "select", options: subjectOpts }, { key: "topicId", label: "Topic", type: "select", options: topics.slice(0, 30).map((t) => ({ label: t.name, value: t.id })) }, { key: "plannedMin", label: "Planned minutes", type: "number" }, { key: "actualMin", label: "Actual minutes", type: "number", required: true }, { key: "date", label: "Date", type: "datetime" }, { key: "note", label: "Notes / mistakes", type: "multiline" }]}
        onSaved={(s) => { if (s.topicId) db.update("topics", s.topicId, { lastReviewed: new Date().toISOString() }, undefined, true); }}
        title={(s) => `${s.actualMin ?? 0}m · ${subjName(s.subjectId)}`} subtitle={(s) => `${s.date ? fmtDay(s.date) : ""} · planned ${s.plannedMin ?? 0}m${s.topicId ? " · " + (db.find("topics", s.topicId)?.name ?? "") : ""}`} /> : null}

      {tab === "profile" ? <>
        <Glass style={{ gap: 6 }}>
          <Row title={st.activeProfileId ? db.find("profiles", st.activeProfileId)?.name ?? "Student" : "Student profile"} subtitle="Grade, year and goals" onPress={() => ui.form({ title: "Student profile", initial: db.list("profiles").find((p) => p.role === "student") ?? {}, fields: [{ key: "name", label: "Name", type: "text", required: true }, { key: "grade", label: "Class / grade", type: "text" }, { key: "year", label: "Academic year", type: "text" }, { key: "availableHours", label: "Available study hours per day", type: "number" }, { key: "prefTime", label: "Preferred study time", type: "select", options: ["morning", "afternoon", "evening"].map((x) => ({ label: x, value: x })) }, { key: "goals", label: "Academic goals", type: "multiline" }], onSubmit: (v) => { const ex = db.list("profiles").find((p) => p.role === "student"); if (ex) db.update("profiles", ex.id, v); else db.add("profiles", { ...v, role: "student" }); if (v.availableHours) db.setSettings({ dailyStudyGoalMin: Math.round(v.availableHours * 60) }); } })} />
        </Glass>
        <T v="headline">Exam timetable</T>
        <CollectionList testID="exams" col="exams" addLabel="Add exam" emptyTitle="No exams" fields={[{ key: "title", label: "Exam", type: "text", required: true }, { key: "subjectId", label: "Subject", type: "select", required: true, options: subjectOpts }, { key: "date", label: "Date", type: "datetime", required: true }]} title={(e) => e.title} subtitle={(e) => `${subjName(e.subjectId)} · ${fmtDay(e.date)} (${daysUntil(e.date)}d)`} sort={(a, b) => a.date.localeCompare(b.date)}
          onSaved={(e) => { if (!db.list("events").some((x) => x.examId === e.id)) db.add("events", { title: "Exam: " + e.title, start: e.date, end: new Date(new Date(e.date).getTime() + 2 * 3600000).toISOString(), calendarId: "study", category: "Class", examId: e.id, locked: true }); }} />
        <T v="headline">Assignments</T>
        <CollectionList testID="assignments" col="assignments" addLabel="Add assignment" emptyTitle="No assignments" fields={[{ key: "title", label: "Assignment", type: "text", required: true }, { key: "subjectId", label: "Subject", type: "select", options: subjectOpts }, { key: "due", label: "Due", type: "datetime", required: true }, { key: "estMin", label: "Estimated minutes", type: "number" }, { key: "done", label: "Done", type: "toggle" }]} title={(a) => (a.done ? "✓ " : "") + a.title} subtitle={(a) => `${subjName(a.subjectId)} · due ${fmtDay(a.due)}`}
          onSaved={(a) => { if (!db.list("tasks").some((t) => t.assignmentId === a.id)) db.add("tasks", { title: a.title, due: a.due, estMin: a.estMin, assignmentId: a.id, status: a.done ? "done" : "todo", priority: 2, tags: ["homework"], subtasks: [], dependsOn: [] }); }} />
        <Btn kind="secondary" icon="share-outline" label="Export progress report" testID="student-report-export" onPress={async () => {
          const lines = [`TIME AI — Student progress report (${fmtDay(new Date())})`, `Study streak: ${studyStreak()} days`, ...subjects.map((s) => { const ts = topics.filter((t) => t.subjectId === s.id); const r = readiness(s.id); return `\n${s.name}: ${ts.filter((t) => t.completed).length}/${ts.length} topics covered; readiness ${r.value === null ? "n/a" : r.value + "% (estimate)"}; quizzes: ${attempts.filter((a) => a.subjectId === s.id).length}`; }), `\nStudy time (7d): ${durLabel(sessions.filter((s) => new Date(s.date) > addDays(new Date(), -7)).reduce((a, s) => a + (s.actualMin || 0), 0))}`, "\nAll figures are computed from data recorded in this app on this device."];
          try { ui.toast(await saveAndShare("student-report.txt", lines.join("\n"), "text/plain")); } catch (e: any) { ui.toast(e.message); }
        }} />
      </> : null}
      <View style={{ height: spacing.sm }} />
    </Screen>
  );
}

function Flashcards({ subjects, topics, cards }: { subjects: Item[]; topics: Item[]; cards: Item[] }) {
  const ui = useUI(); const { colors } = useTheme();
  const [reviewing, setReviewing] = useState(false); const [flip, setFlip] = useState(false); const [idx, setIdx] = useState(0);
  const queue = dueCards();
  const card = queue[idx % Math.max(1, queue.length)];
  const add = () => ui.form({ title: "New flashcard", fields: [{ key: "front", label: "Front (question/term)", type: "multiline", required: true }, { key: "back", label: "Back (answer)", type: "multiline", required: true }, { key: "subjectId", label: "Subject", type: "select", options: subjects.map((s) => ({ label: s.name, value: s.id })) }, { key: "topicId", label: "Topic", type: "select", options: topics.slice(0, 30).map((t) => ({ label: t.name, value: t.id })) }], onSubmit: (v) => { db.add("flashcards", v); } });
  const bulk = () => ui.form({ title: "Bulk add (Term: definition per line)", fields: [{ key: "text", label: "Cards", type: "multiline", required: true }, { key: "topicId", label: "Topic", type: "select", options: topics.slice(0, 30).map((t) => ({ label: t.name, value: t.id })) }], onSubmit: (v) => { const cs = notesToCards(v.text); if (!cs.length) return "No 'Term: definition' lines found."; const t = db.find("topics", v.topicId); db.addMany("flashcards", cs.map((c) => ({ ...c, topicId: v.topicId, subjectId: t?.subjectId }))); ui.toast(`${cs.length} cards added`); } });
  const grade = (g: number) => { db.update("flashcards", card.id, sm2(card, g), "Review card", true); if (card.topicId) db.update("topics", card.topicId, { lastReviewed: new Date().toISOString() }, undefined, true); setFlip(false); setIdx(0); };
  if (reviewing && card) return (
    <View style={{ gap: spacing.md }} testID="flashcard-review">
      <T muted>{queue.length} due · spaced repetition (SM-2)</T>
      <Glass onPress={() => setFlip(!flip)} testID="flashcard" style={{ minHeight: 220, alignItems: "center", justifyContent: "center", gap: 10 }}>
        <T v="caption" muted>{flip ? "ANSWER" : "QUESTION"} · tap to flip</T>
        <T v="title" style={{ textAlign: "center" }}>{flip ? card.back : card.front}</T>
      </Glass>
      {flip ? <View style={{ flexDirection: "row", gap: 6 }}>{[["Again", 1, colors.error], ["Hard", 3, colors.warning], ["Good", 4, colors.info], ["Easy", 5, colors.success]].map(([l, g]) => <Btn key={l as string} testID={`grade-${(l as string).toLowerCase()}`} small style={{ flex: 1 }} kind={g === 4 ? "primary" : "secondary"} label={l as string} onPress={() => grade(g as number)} />)}</View> : <Btn testID="flashcard-show-answer" label="Show answer" onPress={() => setFlip(true)} />}
      <Btn kind="ghost" label="Stop review" onPress={() => setReviewing(false)} />
    </View>);
  return (
    <View style={{ gap: spacing.md }}>
      <Glass style={{ gap: 8 }}><T v="title" testID="cards-due">{queue.length} due</T><T muted>{cards.length} cards total</T><Btn testID="flashcards-review-button" label={queue.length ? "Start review" : "Nothing due"} disabled={!queue.length} onPress={() => { setReviewing(true); setIdx(0); setFlip(false); }} /></Glass>
      {reviewing && !card ? <T>🎉 All caught up.</T> : null}
      <View style={{ flexDirection: "row", gap: 8 }}><Btn small testID="flashcard-add" label="Card" icon="add" onPress={add} /><Btn small kind="secondary" label="Bulk add" onPress={bulk} /></View>
      <Glass>{cards.slice(0, 40).map((c, i) => <View key={c.id}>{i ? <Divider /> : null}<Row title={c.front} subtitle={`${c.back} · next ${c.due ? fmtDay(c.due) : "now"}${c.lapses ? ` · ${c.lapses} lapses` : ""}`} onPress={() => ui.form({ title: "Edit card", initial: c, fields: [{ key: "front", label: "Front", type: "multiline", required: true }, { key: "back", label: "Back", type: "multiline", required: true }], onSubmit: (v) => { db.update("flashcards", c.id, v); }, onDelete: () => db.remove("flashcards", c.id) })} /></View>)}{!cards.length ? <T muted>No cards. Add some or generate from a note.</T> : null}</Glass>
    </View>
  );
}

function Quiz({ subjects, topics, questions, attempts }: { subjects: Item[]; topics: Item[]; questions: Item[]; attempts: Item[] }) {
  const ui = useUI(); const { colors } = useTheme();
  const [topicId, setTopicId] = useState<string>("all");
  const [run, setRun] = useState<{ qs: Item[]; i: number; score: number; mistakes: any[]; answer: string; shown: boolean; conf: number } | null>(null);
  const pool = questions.filter((q) => topicId === "all" || q.topicId === topicId);
  const add = () => ui.form({ title: "New question", initial: { type: "mcq" }, fields: [{ key: "type", label: "Type", type: "select", required: true, options: [{ label: "Multiple choice", value: "mcq" }, { label: "Short answer", value: "short" }] }, { key: "prompt", label: "Question", type: "multiline", required: true }, { key: "options", label: "Options (MCQ, comma separated)", type: "tags" }, { key: "answer", label: "Correct answer", type: "text", required: true }, { key: "explanation", label: "Explanation", type: "multiline" }, { key: "topicId", label: "Topic", type: "select", required: true, options: topics.slice(0, 30).map((t) => ({ label: t.name, value: t.id })) }],
    onSubmit: (v) => { if (v.type === "mcq" && (!v.options?.length || !v.options.includes(v.answer))) return "For MCQ, the correct answer must be one of the options."; db.add("questions", { ...v, subjectId: db.find("topics", v.topicId)?.subjectId }); } });
  const finish = (r: NonNullable<typeof run>) => {
    const byTopic: Record<string, { s: number; t: number; m: any[] }> = {};
    r.qs.forEach((q, i) => { const k = q.topicId; byTopic[k] ||= { s: 0, t: 0, m: [] }; byTopic[k].t++; if (!r.mistakes.some((m) => m.i === i)) byTopic[k].s++; else byTopic[k].m.push(r.mistakes.find((m) => m.i === i)); });
    Object.entries(byTopic).forEach(([tid, v]) => { db.add("attempts", { topicId: tid, subjectId: db.find("topics", tid)?.subjectId, score: v.s, total: v.t, mistakes: v.m, confidence: r.conf }); db.update("topics", tid, { lastReviewed: new Date().toISOString() }, undefined, true); });
    setRun(null); ui.toast(`Score ${r.score}/${r.qs.length} saved`);
  };
  if (run) {
    const q = run.qs[run.i];
    const correct = run.answer.trim().toLowerCase() === String(q.answer).trim().toLowerCase();
    const submit = () => setRun({ ...run, shown: true, score: run.score + (correct ? 1 : 0), mistakes: correct ? run.mistakes : [...run.mistakes, { i: run.i, prompt: q.prompt, given: run.answer, answer: q.answer }] });
    return (
      <View style={{ gap: spacing.md }} testID="quiz-run">
        <T muted>Question {run.i + 1}/{run.qs.length} · score {run.score}</T>
        <Glass style={{ gap: 10 }}><T v="headline">{q.prompt}</T>
          {q.type === "mcq" ? (q.options ?? []).map((o: string) => <Chip key={o} testID={`quiz-option-${o}`} label={o} active={run.answer === o} onPress={() => !run.shown && setRun({ ...run, answer: o })} />)
            : <TextInput testID="quiz-answer-input" editable={!run.shown} value={run.answer} onChangeText={(t) => setRun({ ...run, answer: t })} placeholder="Your answer" placeholderTextColor={colors.muted} style={[type.body, { height: 48, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: 12, color: colors.onSurface }]} />}
          {run.shown ? <T testID="quiz-feedback" color={correct ? colors.success : colors.error}>{correct ? "✓ Correct" : `✗ Answer: ${q.answer}`}{q.explanation ? "\n" + q.explanation : ""}</T> : null}
        </Glass>
        {!run.shown ? <Btn testID="quiz-submit" label="Check" disabled={!run.answer} onPress={submit} /> : run.i + 1 < run.qs.length ? <Btn testID="quiz-next" label="Next" onPress={() => setRun({ ...run, i: run.i + 1, answer: "", shown: false })} /> : <>
          <T>How confident do you feel? (self-assessment)</T>
          <View style={{ flexDirection: "row", gap: 6 }}>{[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={String(n)} active={run.conf === n} onPress={() => setRun({ ...run, conf: n })} />)}</View>
          <Btn testID="quiz-finish" label="Finish & save" onPress={() => finish(run)} /></>}
      </View>);
  }
  const mistakes = attempts.flatMap((a) => (a.mistakes ?? []).map((m: any) => ({ ...m, topic: db.find("topics", a.topicId)?.name, date: a.createdAt })));
  return (
    <View style={{ gap: spacing.md }}>
      <ChipRow testID="quiz-topic" value={topicId} onChange={setTopicId} options={[{ label: "All topics", value: "all" }, ...topics.filter((t) => questions.some((q) => q.topicId === t.id)).map((t) => ({ label: t.name, value: t.id }))]} />
      <Glass style={{ gap: 8 }}><T v="headline">{pool.length} question(s) in bank</T>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Btn testID="quiz-start" label="Practice quiz (10)" disabled={!pool.length} onPress={() => setRun({ qs: [...pool].sort(() => Math.random() - 0.5).slice(0, 10), i: 0, score: 0, mistakes: [], answer: "", shown: false, conf: 3 })} />
          <Btn kind="secondary" label="Practice test (all)" disabled={!pool.length} onPress={() => setRun({ qs: [...pool], i: 0, score: 0, mistakes: [], answer: "", shown: false, conf: 3 })} />
          <Btn kind="secondary" label="Retry mistakes" disabled={!mistakes.length} onPress={() => { const qs = pool.filter((q) => mistakes.some((m) => m.prompt === q.prompt)); if (qs.length) setRun({ qs, i: 0, score: 0, mistakes: [], answer: "", shown: false, conf: 3 }); }} />
        </View></Glass>
      <View style={{ flexDirection: "row", gap: 8 }}><Btn small testID="question-add" label="Question" icon="add" onPress={add} /><Btn small kind="secondary" label="Import CSV" onPress={async () => { try { const f = await pickText(); if (!f) return; const { fromCSV } = require("@/src/engine/io"); const rows: string[][] = fromCSV(f.text).slice(1); const tid = topicId !== "all" ? topicId : topics[0]?.id; if (!tid) throw new Error("Create a topic first."); db.addMany("questions", rows.filter((r) => r[0] && r[1]).map((r) => ({ prompt: r[0], answer: r[1], options: r[2] ? r[2].split("|") : [], type: r[2] ? "mcq" : "short", topicId: tid, subjectId: db.find("topics", tid)?.subjectId }))); ui.toast(`${rows.length} questions imported (question,answer,opt1|opt2)`); } catch (e: any) { ui.toast(e.message); } }} /></View>
      <Section title="Mistake tracker">
        <Glass>{mistakes.slice(0, 15).map((m, i) => <View key={i}>{i ? <Divider /> : null}<Row title={m.prompt} subtitle={`${m.topic ?? ""} · you: "${m.given}" · correct: "${m.answer}"`} /></View>)}{!mistakes.length ? <T muted>No mistakes recorded.</T> : null}</Glass>
      </Section>
      <Section title="Recent results (measured)">
        <Glass>{attempts.slice(0, 10).map((a, i) => <View key={a.id}>{i ? <Divider /> : null}<Row title={`${db.find("topics", a.topicId)?.name ?? "Topic"}: ${a.score}/${a.total}`} subtitle={fmtDay(a.createdAt) + (a.confidence ? ` · confidence ${a.confidence}/5` : "")} /></View>)}{!attempts.length ? <T muted>No quizzes taken.</T> : null}</Glass>
      </Section>
      {subjects.length ? null : null}
    </View>
  );
}
