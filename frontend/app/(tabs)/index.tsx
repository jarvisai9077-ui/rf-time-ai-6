import { Redirect, router } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { endOfDay, addDays } from "date-fns";
import { usesNativeTabs } from "@/src/navigation";
import { db, useCol, useSettings } from "@/src/store/db";
import { spacing, useTheme } from "@/src/theme";
import { dayEvents, deadlineRisk, prioritized, todayBudget } from "@/src/engine/planner";
import { dueCards, recommendTopics, studyStreak } from "@/src/engine/learning";
import { missedReminders } from "@/src/engine/notify";
import { durLabel, fmtDay, fmtTime, todayKey } from "@/src/engine/time";
import { Badge, Btn, Check, Empty, Glass, Icon, IconBtn, Progress, Row, Screen, Section, T, Divider } from "@/src/ui/kit";
import { QuickGrid } from "@/src/ui/quick";
import { completeTask } from "@/src/ui/forms";
import { useUI } from "@/src/ui/overlay";
import { BrandLogo } from "@/src/ui/brand";
import { format } from "date-fns";

export default function Today() {
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const st = useSettings();
  const { colors } = useTheme();
  const ui = useUI();
  // subscribe to collections so the dashboard re-renders on any change
  const tasks = useCol("tasks"); const events = useCol("events"); const goals = useCol("goals"); const habits = useCol("habits");
  const notes = useCol("notes"); const queue = useCol("queue"); const focus = useCol("focusSessions"); const routines = useCol("routines");
  const topics = useCol("topics"); const cards = useCol("flashcards"); const inbox = useCol("inbox"); const reminders = useCol("reminders"); const attempts = useCol("attempts"); const cals = useCol("calendars");
  const [refresh, force] = useState(0);
  const now = new Date();
  // Heavy planner/learning computations are memoized and only recomputed when their source data changes.
  const todays = useMemo(() => dayEvents(new Date()), [events, cals, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const pr = useMemo(() => prioritized().slice(0, 5), [tasks, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const budget = useMemo(() => todayBudget(st), [tasks, events, st, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const recs = useMemo(() => recommendTopics(2), [topics, attempts, cards, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const dueCount = useMemo(() => dueCards().length, [cards, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const missed = useMemo(() => missedReminders(), [reminders, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  if (st.kidsMode) return <Redirect href="/kids" />;
  const next = todays.find((e) => e.e > now) ?? null;
  const deadlines = tasks.filter((t) => t.status !== "done" && t.due && new Date(t.due) <= endOfDay(addDays(now, 7))).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);
  const pending = queue.filter((q) => q.status === "pending" || q.status === "failed");
  const tk = todayKey();
  const focusToday = focus.filter((f) => f.start?.slice(0, 10) === tk);
  const unread = inbox.filter((i) => !i.read);
  const doneToday = tasks.filter((t) => t.status === "done" && t.completedAt?.slice(0, 10) === tk).length;
  const pinned = [...notes.filter((n) => n.pinned).map((n) => ({ t: n.title, icon: "document-text", r: `/note/${n.id}` })), ...goals.filter((g) => g.pinned).map((g) => ({ t: g.title, icon: "flag", r: "/goals" })), ...tasks.filter((x) => x.pinned && x.status !== "done").map((x) => ({ t: x.title, icon: "checkbox", r: "/tasks" })), ...db.list("projects").filter((p) => p.pinned).map((p) => ({ t: p.title, icon: "briefcase", r: `/project/${p.id}` })), ...db.list("workspaces").filter((p) => p.pinned).map((p) => ({ t: p.name, icon: "albums", r: "/workspaces" })), ...db.list("databases").filter((p) => p.pinned).map((p) => ({ t: p.name, icon: "grid", r: `/database/${p.id}` }))];

  const widgets: Record<string, () => React.ReactNode> = {
    schedule: () => (
      <Section key="schedule" title="Today's schedule" action="Calendar" onAction={() => router.push("/calendar")} testID="widget-schedule">
        <Glass>{todays.length ? todays.map((e, i) => (
          <View key={e.occKey}>{i ? <Divider /> : null}
            <Row title={e.title} subtitle={`${e.allDay ? "All day" : `${fmtTime(e.s)} – ${fmtTime(e.e)}`}${e.location ? " · " + e.location : ""}`} left={<View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: db.find("calendars", e.calendarId)?.color ?? colors.brandPrimary }} />} right={e.locked ? <Icon name="lock-closed" size={14} color={colors.muted} /> : undefined} onPress={() => router.push("/calendar")} />
          </View>)) : <T muted>No events today. Ask the Agent to "plan my day".</T>}</Glass>
      </Section>),
    next: () => (
      <Section key="next" title="Next up & deadlines" testID="widget-next">
        <Glass style={{ gap: 8 }}>
          <T v="caption" muted>NEXT EVENT</T>
          <T v="headline" testID="next-event-title">{next ? `${next.title} · ${fmtTime(next.s)}` : "Nothing else today"}</T>
          <Divider />
          {deadlines.length ? deadlines.map((t) => { const r = deadlineRisk(t, st); return <Row key={t.id} title={t.title} subtitle={`${fmtDay(t.due)} · ${r.detail}`} right={<Badge label={r.level} tone={r.level === "at risk" ? "error" : r.level === "tight" ? "warning" : r.level === "ok" ? "success" : "muted"} />} onPress={() => router.push("/tasks")} />; }) : <T muted>No deadlines this week.</T>}
        </Glass>
      </Section>),
    tasks: () => (
      <Section key="tasks" title="Prioritized tasks" action="All tasks" onAction={() => router.push("/tasks")} testID="widget-tasks">
        <Glass>{pr.length ? pr.map((x, i) => (
          <View key={x.t.id}>{i ? <Divider /> : null}
            <Row testID={`home-task-${x.t.id}`} title={x.t.title} subtitle={x.why.join(" · ")} left={<Check testID={`home-task-check-${x.t.id}`} label={`Complete ${x.t.title}`} on={false} onPress={() => { completeTask(x.t); ui.toast("Task completed", () => db.undo()); }} />} />
          </View>)) : <Empty testID="home-tasks-empty" icon="checkmark-done-outline" title="All clear" body="No open tasks." />}</Glass>
      </Section>),
    budget: () => (
      <Section key="budget" title="Daily time budget" testID="widget-budget">
        <Glass style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View><T v="caption" muted>FREE</T><T v="title" testID="budget-free">{durLabel(budget.free)}</T></View>
            <View><T v="caption" muted>EVENTS</T><T v="title">{durLabel(budget.events)}</T></View>
            <View><T v="caption" muted>DUE WORK</T><T v="title" color={budget.over ? colors.error : undefined}>{durLabel(budget.need)}</T></View>
          </View>
          <Progress value={budget.free ? budget.need / budget.free : 1} color={budget.over ? colors.error : colors.brandPrimary} />
          <T v="caption" muted>{budget.over ? "⚠ Tasks due today exceed your free time — ask the Agent to \"move unfinished tasks\"." : `Within working hours ${st.workStart}–${st.workEnd}. Tasks without estimates count as 30m.`}</T>
        </Glass>
      </Section>),
    goals: () => (
      <Section key="goals" title="Goals & milestones" action="Open" onAction={() => router.push("/goals")} testID="widget-goals">
        <Glass style={{ gap: 12 }}>{goals.length ? goals.slice(0, 3).map((g) => (
          <View key={g.id} style={{ gap: 6 }}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><T numberOfLines={1} style={{ flex: 1 }}>{g.title}</T><T v="caption" muted>{g.current ?? 0}/{g.target} {g.unit}</T></View><Progress value={(g.current ?? 0) / (g.target || 1)} /></View>)) : <T muted>No goals yet.</T>}</Glass>
      </Section>),
    habits: () => (
      <Section key="habits" title="Habits & routines" action="Open" onAction={() => router.push("/goals?tab=habits")} testID="widget-habits">
        <Glass>{habits.length ? habits.slice(0, 5).map((h) => { const on = (h.log ?? []).includes(tk); return <Row key={h.id} title={h.title} subtitle={h.schedule} left={<Check testID={`home-habit-${h.id}`} label={`Log ${h.title}`} on={on} onPress={() => db.update("habits", h.id, { log: on ? h.log.filter((d: string) => d !== tk) : [...(h.log ?? []), tk] }, "Log habit")} />} />; }) : <T muted>No habits yet.</T>}
          {routines.length ? <T v="caption" muted style={{ marginTop: 6 }}>{routines.length} routine(s) · open Goals › Routines to run</T> : null}</Glass>
      </Section>),
    learning: () => (
      <Section key="learning" title="Learning & revisions" action="Student" onAction={() => router.push("/student")} testID="widget-learning">
        <Glass style={{ gap: 6 }}>
          <T testID="due-cards-count">{dueCount} flashcard(s) due · streak {studyStreak()}d</T>
          {recs.map((r) => <T key={r.t.id} v="caption" muted>• {r.t.name}: {r.why[0] ?? "balanced practice"}</T>)}
          {!recs.length ? <T v="caption" muted>Add subjects & topics in Student Mode.</T> : null}
        </Glass>
      </Section>),
    focus: () => (
      <Section key="focus" title="Focus sessions" action="Start" onAction={() => router.push("/clock?tab=focus")} testID="widget-focus">
        <Glass><T>{focusToday.length} session(s) today · {durLabel(focusToday.reduce((a, f) => a + f.minutes, 0))}</T></Glass>
      </Section>),
    pinned: () => pinned.length ? (
      <Section key="pinned" title="Pinned" testID="widget-pinned">
        <Glass>{pinned.slice(0, 6).map((p, i) => <Row key={i} title={p.t} left={<Icon name={p.icon} size={18} color={colors.brandPrimary} />} onPress={() => router.push(p.r as any)} />)}</Glass>
      </Section>) : null,
    notes: () => (
      <Section key="notes" title="Recent notes" action="Notes" onAction={() => router.push("/notes")} testID="widget-notes">
        <Glass>{notes.filter((n) => !n.archived).slice(0, 3).map((n) => <Row key={n.id} title={n.title} subtitle={n.body?.slice(0, 60)} onPress={() => router.push(`/note/${n.id}` as any)} />)}{!notes.length ? <T muted>No notes yet.</T> : null}</Glass>
      </Section>),
    ai: () => (pending.length || unread.length || missed.length) ? (
      <Section key="ai" title="Pending AI actions & alerts" action="Queue" onAction={() => router.push("/queue")} testID="widget-ai">
        <Glass style={{ gap: 6 }}>
          {pending.length ? <T testID="pending-actions-count">{pending.length} action(s) awaiting approval/retry</T> : null}
          {unread.slice(0, 3).map((i) => <Row key={i.id} title={i.title} subtitle={i.body?.slice(0, 80)} onPress={() => { db.update("inbox", i.id, { read: true }, undefined, true); ui.sheet(i.title, <T>{i.body}</T>); }} />)}
          {missed.slice(0, 3).map((r) => <Row key={r.id} title={`Missed: ${r.title}`} subtitle={fmtDay(r.at) + " " + fmtTime(r.at)} right={<Badge label="ack" tone="warning" />} onPress={() => db.update("reminders", r.id, { fired: true }, undefined, true)} />)}
        </Glass>
      </Section>) : null,
    insights: () => (
      <Section key="insights" title="Personal insights" action="Analytics" onAction={() => router.push("/analytics")} testID="widget-insights">
        <Glass style={{ gap: 4 }}>
          <T>{doneToday} task(s) done today · {tasks.filter((t) => t.status !== "done" && t.due && new Date(t.due) < now).length} overdue</T>
          <T v="caption" muted>{habits.length ? `Habit completion today: ${habits.filter((h) => h.log?.includes(tk)).length}/${habits.length}` : "Track habits to see consistency."}</T>
        </Glass>
      </Section>),
    quick: () => (<Section key="quick" title="Quick actions" testID="widget-quick"><QuickGrid /></Section>),
  };

  return (
    <Screen testID="today-screen" back={false} title={format(now, "EEEE")} subtitle={format(now, "d MMMM") + " · Offline · on-device"} bottomPad={bottomChrome + spacing.xl} onRefresh={() => force((x) => x + 1)}
      right={<><IconBtn testID="home-search-button" label="Search" icon="search" onPress={() => router.push("/search")} /><IconBtn testID="home-settings-button" label="Customize" icon="options" onPress={() => router.push("/settings?tab=dashboard")} /></>}>
      {!st.onboarded ? (
        <Glass testID="onboarding-card" style={{ gap: 8, borderColor: colors.brandPrimary }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <BrandLogo size={44} testID="onboarding-brand-logo" />
            <T v="headline" style={{ flex: 1 }}>Welcome to TIME AI</T>
          </View>
          <T muted>Everything runs on this device — no account, no internet, no cloud AI. The Agent is a transparent local rule engine. Start by adding a task or event, or ask the Agent.</T>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn testID="onboarding-dismiss" small label="Got it" icon="checkmark" onPress={() => db.setSettings({ onboarded: true })} />
          </View>
        </Glass>
      ) : null}
      {st.dashboard.filter((d) => d.visible && widgets[d.key]).map((d) => widgets[d.key]())}
      {events.length < 0 ? null : null}
    </Screen>
  );
}
