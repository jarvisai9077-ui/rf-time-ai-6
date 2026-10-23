import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { endOfMonth, format, startOfMonth, addMonths } from "date-fns";
import { db, useCol, useSettings } from "@/src/store/db";
import { useTheme } from "@/src/theme";
import { fmtDay } from "@/src/engine/time";
import { scheduleReminder } from "@/src/engine/notify";
import { saveAndShare, toCSV } from "@/src/engine/io";
import { Badge, Bars, Btn, ChipRow, Glass, IconBtn, Progress, Screen, Section, Stat, T } from "@/src/ui/kit";
import { CollectionList } from "@/src/ui/collection";
import { useUI } from "@/src/ui/overlay";

const CATS = ["Food", "Transport", "Housing", "Bills", "Shopping", "Health", "Education", "Entertainment", "Savings", "Salary", "Other"];

export default function Finance() {
  const insets = useSafeAreaInsets(); const ui = useUI(); const { colors } = useTheme(); const st = useSettings();
  const [tab, setTab] = useState<"summary" | "txns" | "budgets" | "savings" | "bills">("summary");
  const [month, setMonth] = useState(new Date());
  const txns = useCol("transactions"); const budgets = useCol("budgets"); const bills = useCol("bills"); useCol("savings");
  const c = st.currency;
  const inMonth = txns.filter((t) => new Date(t.date) >= startOfMonth(month) && new Date(t.date) <= endOfMonth(month));
  const income = inMonth.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);
  const spend = inMonth.filter((t) => t.type !== "income").reduce((a, t) => a + t.amount, 0);
  const byCat = CATS.map((k) => ({ label: k.slice(0, 4), full: k, value: inMonth.filter((t) => t.type !== "income" && t.category === k).reduce((a, t) => a + t.amount, 0) })).filter((x) => x.value > 0);
  const money = (n: number) => `${c}${n.toFixed(2)}`;
  return (
    <Screen testID="finance-screen" title="Finance" subtitle="Manual entries only · no bank connection" bottomPad={insets.bottom + 40}
      right={<IconBtn testID="finance-export" label="Export CSV" icon="share-outline" onPress={async () => { try { ui.toast(await saveAndShare("timeai-finance.csv", toCSV(["date", "type", "amount", "category", "note"], txns.map((t) => [t.date, t.type, t.amount, t.category, t.note])), "text/csv")); } catch (e: any) { ui.toast(e.message); } }} />}
      header={<ChipRow testID="finance-tab" value={tab} onChange={setTab} options={[{ label: "Summary", value: "summary" }, { label: "Transactions", value: "txns" }, { label: "Budgets", value: "budgets" }, { label: "Savings", value: "savings" }, { label: "Bills", value: "bills" }]} />}>
      {tab === "summary" ? <>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><IconBtn label="Previous month" icon="chevron-back" onPress={() => setMonth(addMonths(month, -1))} /><T v="headline">{format(month, "MMMM yyyy")}</T><IconBtn label="Next month" icon="chevron-forward" onPress={() => setMonth(addMonths(month, 1))} /></View>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}><Stat label="Income" value={money(income)} icon="arrow-down-circle-outline" testID="finance-income" /><Stat label="Spent" value={money(spend)} icon="arrow-up-circle-outline" testID="finance-spent" /><Stat label="Net" value={money(income - spend)} icon="wallet-outline" /></View>
        <Section title="Spending by category"><Glass>{byCat.length ? <Bars testID="finance-chart" data={byCat} /> : <T muted>No expenses this month.</T>}</Glass></Section>
        <Section title="Budgets"><Glass style={{ gap: 10 }}>{budgets.map((b) => { const used = inMonth.filter((t) => t.type !== "income" && t.category === b.category).reduce((a, t) => a + t.amount, 0); return <View key={b.id} style={{ gap: 4 }}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><T>{b.category}</T><T v="caption" color={used > b.limit ? colors.error : colors.muted}>{money(used)} / {money(b.limit)}{used > b.limit ? " · over" : ""}</T></View><Progress value={used / (b.limit || 1)} color={used > b.limit ? colors.error : undefined} /></View>; })}{!budgets.length ? <T muted>No budgets set.</T> : null}</Glass></Section>
      </> : null}
      {tab === "txns" ? <CollectionList testID="txns" col="transactions" addLabel="Add transaction" emptyTitle="No transactions" defaults={{ type: "expense", date: new Date().toISOString(), category: "Other" }} sort={(a, b) => b.date.localeCompare(a.date)}
        fields={[{ key: "type", label: "Type", type: "select", required: true, options: [{ label: "Expense", value: "expense" }, { label: "Income", value: "income" }] }, { key: "amount", label: "Amount", type: "number", required: true }, { key: "category", label: "Category", type: "select", required: true, options: CATS.map((x) => ({ label: x, value: x })) }, { key: "date", label: "Date", type: "date", required: true }, { key: "note", label: "Note", type: "text" }, { key: "recurring", label: "Recurring monthly", type: "toggle" }]}
        title={(t) => `${t.type === "income" ? "+" : "−"}${money(t.amount ?? 0)} · ${t.category}`} subtitle={(t) => `${fmtDay(t.date)}${t.note ? " · " + t.note : ""}${t.recurring ? " · ↻" : ""}`} /> : null}
      {tab === "budgets" ? <CollectionList testID="budgets" col="budgets" addLabel="Add budget" emptyTitle="No budgets" fields={[{ key: "category", label: "Category", type: "select", required: true, options: CATS.map((x) => ({ label: x, value: x })) }, { key: "limit", label: "Monthly limit", type: "number", required: true }]} title={(b) => b.category} subtitle={(b) => `${money(b.limit ?? 0)} / month`} /> : null}
      {tab === "savings" ? <CollectionList testID="savings" col="savings" addLabel="Add savings goal" emptyTitle="No savings goals" fields={[{ key: "name", label: "Goal", type: "text", required: true }, { key: "target", label: "Target", type: "number", required: true }, { key: "saved", label: "Saved so far", type: "number" }, { key: "deadline", label: "By", type: "date" }]} title={(s) => s.name} subtitle={(s) => `${money(s.saved ?? 0)} of ${money(s.target ?? 0)} (${Math.round(((s.saved ?? 0) / (s.target || 1)) * 100)}%)${s.deadline ? " · by " + fmtDay(s.deadline) : ""}`} /> : null}
      {tab === "bills" ? <CollectionList testID="bills" col="bills" addLabel="Add recurring bill" emptyTitle="No bills" fields={[{ key: "name", label: "Bill", type: "text", required: true }, { key: "amount", label: "Amount", type: "number" }, { key: "dueDay", label: "Due day of month (1–28)", type: "number", required: true }, { key: "remindDays", label: "Remind days before", type: "number" }]}
        title={(b) => b.name} subtitle={(b) => `${money(b.amount ?? 0)} · due day ${b.dueDay}`} right={(b) => { const d = new Date(); return d.getDate() > b.dueDay - (b.remindDays ?? 2) && d.getDate() <= b.dueDay ? <Badge label="due soon" tone="warning" /> : undefined; }}
        onSaved={async (b) => { if (b.dueDay < 1 || b.dueDay > 28) return; const d = new Date(); d.setDate(b.dueDay - (b.remindDays ?? 2)); d.setHours(9, 0, 0, 0); if (d < new Date()) d.setMonth(d.getMonth() + 1); const r = await scheduleReminder(`Bill due: ${b.name}`, d, { kind: "bill", refId: b.id }); ui.toast(r.error ? "Saved (reminder in-app only)" : `Reminder ${fmtDay(d)}`); }} /> : null}
      {tab !== "summary" ? null : <T v="caption" muted>All figures come from entries you typed. Nothing is connected to banks or payment services.</T>}
      {tab === "bills" ? <Btn kind="ghost" label="" onPress={() => {}} style={{ display: "none" }} /> : null}
    </Screen>
  );
}
