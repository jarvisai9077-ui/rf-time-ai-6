// Offline adaptive learning: SM-2 spaced repetition + evidence-based topic recommendations.
import { addDays } from "date-fns";
import { db, Item } from "@/src/store/db";
import { daysUntil } from "./time";

// grade: 0 again, 3 hard, 4 good, 5 easy
export function sm2(card: Item, grade: number) {
  let ef = card.ef ?? 2.5, reps = card.reps ?? 0, interval = card.interval ?? 0, lapses = card.lapses ?? 0;
  if (grade < 3) { reps = 0; interval = 1; lapses += 1; }
  else { reps += 1; interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval * ef); }
  ef = Math.max(1.3, ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
  return { ef, reps, interval, lapses, due: addDays(new Date(), interval).toISOString(), lastReviewed: new Date().toISOString() };
}
export const dueCards = () => db.list("flashcards").filter((c) => !c.due || new Date(c.due) <= new Date());

// Measured mastery: average of last 3 quiz attempts + flashcard retention. null = no evidence.
export function mastery(topicId: string): { value: number | null; evidence: number } {
  const att = db.list("attempts").filter((a) => a.topicId === topicId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const cards = db.list("flashcards").filter((c) => c.topicId === topicId && c.reps);
  const parts: number[] = att.map((a) => a.score / Math.max(1, a.total));
  if (cards.length) parts.push(cards.reduce((a, c) => a + Math.min(1, (c.reps ?? 0) / 4) * (c.lapses ? 0.7 : 1), 0) / cards.length);
  if (!parts.length) return { value: null, evidence: 0 };
  return { value: parts.reduce((a, b) => a + b, 0) / parts.length, evidence: att.length + cards.length };
}

export function recommendTopics(limit = 5) {
  const topics = db.list("topics").filter((t) => !t.completed);
  const exams = db.list("exams");
  return topics.map((t) => {
    const why: string[] = [];
    let score = 0;
    const m = mastery(t.id);
    if (m.value === null) { score += 25; why.push("not yet assessed"); }
    else { score += (1 - m.value) * 50; if (m.value < 0.6) why.push(`measured mastery ${Math.round(m.value * 100)}% (weak)`); }
    const conf = t.confidence ?? 3;
    if (conf <= 2) { score += 10; why.push(`you rated confidence ${conf}/5`); }
    if (t.lastReviewed) {
      const d = -daysUntil(t.lastReviewed);
      if (d >= 7) { score += Math.min(20, d); why.push(`last reviewed ${d}d ago`); }
    }
    score += (t.difficulty ?? 3) * 3;
    const ex = exams.filter((e) => e.subjectId === t.subjectId && daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (ex) { const d = daysUntil(ex.date); score += Math.max(0, 30 - d * 2); why.push(`${ex.title} in ${d}d`); }
    const mistakes = db.list("attempts").filter((a) => a.topicId === t.id).reduce((a, x) => a + (x.mistakes?.length ?? 0), 0);
    if (mistakes) { score += Math.min(15, mistakes * 3); why.push(`${mistakes} past mistake(s)`); }
    const prereqOpen = (t.prereqIds ?? []).map((id: string) => db.find("topics", id)).filter((p: Item | undefined) => p && !p.completed && !p.deleted);
    if (prereqOpen.length) { score -= 40; why.push(`learn "${prereqOpen[0].name}" first (prerequisite)`); }
    const difficultyLevel = m.value === null ? "medium" : m.value < 0.5 ? "easy" : m.value < 0.8 ? "medium" : "hard";
    const interval = m.value === null ? 1 : m.value < 0.5 ? 1 : m.value < 0.8 ? 3 : 7;
    return { t, score, why, mastery: m, difficultyLevel, interval, blocked: prereqOpen.length > 0 };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}

export function readiness(subjectId: string) {
  const topics = db.list("topics").filter((t) => t.subjectId === subjectId);
  if (!topics.length) return { value: null as number | null, note: "No topics yet" };
  const ms = topics.map((t) => mastery(t.id));
  const assessed = ms.filter((m) => m.value !== null);
  if (!assessed.length) return { value: null, note: "No quiz or flashcard evidence yet" };
  const coverage = topics.filter((t) => t.completed).length / topics.length;
  const avg = assessed.reduce((a, m) => a + (m.value ?? 0), 0) / assessed.length;
  return { value: Math.round((avg * 0.7 + coverage * 0.3) * 100), note: `ESTIMATE from ${assessed.length}/${topics.length} assessed topics and ${Math.round(coverage * 100)}% syllabus completion` };
}

// Local notes-to-quiz: cloze deletion of the longest word in each sentence (no AI model).
export function notesToQuestions(text: string) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.split(" ").length >= 5);
  return sentences.slice(0, 20).map((s) => {
    const words = s.replace(/[^\w\s-]/g, "").split(/\s+/);
    const key = [...words].sort((a, b) => b.length - a.length)[0];
    return { type: "short", prompt: s.replace(new RegExp(`\\b${key}\\b`), "_____"), answer: key, explanation: s };
  });
}
// "Term: definition" / "Term - definition" lines → flashcards
export function notesToCards(text: string) {
  return text.split(/\n+/).map((l) => l.match(/^\s*[-*]?\s*(.{2,80}?)\s*[:\u2013-]\s+(.{2,})$/)).filter(Boolean).map((m) => ({ front: m![1], back: m![2] }));
}
// Syllabus text → topics. Lines "Subject > Chapter > Topic" or "Chapter: topic, topic".
export function parseSyllabus(text: string) {
  const out: { chapter: string; name: string }[] = [];
  let chapter = "General";
  for (const raw of text.split(/\n+/)) {
    const l = raw.trim(); if (!l) continue;
    if (/^(chapter|unit|module|#)/i.test(l) && !l.includes(":")) { chapter = l.replace(/^#+\s*/, ""); continue; }
    const m = l.match(/^(.+?):\s*(.+)$/);
    if (m) { chapter = m[1]; m[2].split(/[,;]/).map((x) => x.trim()).filter(Boolean).forEach((name) => out.push({ chapter, name })); }
    else out.push({ chapter, name: l.replace(/^[-*\d.)\s]+/, "") });
  }
  return out.filter((x) => x.name);
}

export function studyStreak(): number {
  const days = new Set([...db.list("studySessions").map((s) => s.date?.slice(0, 10)), ...db.list("attempts").map((a) => a.createdAt.slice(0, 10)), ...db.list("flashcards").filter((c) => c.lastReviewed).map((c) => c.lastReviewed.slice(0, 10))]);
  let n = 0;
  for (let d = new Date(); days.has(d.toISOString().slice(0, 10)); d = addDays(d, -1)) n++;
  return n;
}
