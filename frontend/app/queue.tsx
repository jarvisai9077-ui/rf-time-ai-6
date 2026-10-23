import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, useCol } from "@/src/store/db";
import { cancelQueued, runQueued, undoQueued, ACTION_INFO } from "@/src/engine/actions";
import { fmtDT } from "@/src/engine/time";
import { Badge, Btn, ChipRow, Empty, Glass, Screen, T } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

const ST = ["pending", "running", "completed", "failed", "cancelled", "undone"] as const;

export default function Queue() {
  const insets = useSafeAreaInsets(); const ui = useUI();
  const q = useCol("queue");
  const [f, setF] = useState<string>("pending");
  const items = q.filter((x) => f === "all" || x.status === f);
  return (
    <Screen testID="queue-screen" title="Action Queue" subtitle="Every AI/automation change, validated & logged" bottomPad={insets.bottom + 40}
      header={<ChipRow testID="queue-filter" value={f} onChange={setF} options={[{ label: "All", value: "all" }, ...ST.map((s) => ({ label: `${s[0].toUpperCase() + s.slice(1)} (${q.filter((x) => x.status === s).length})`, value: s }))]} />}>
      {f === "pending" && items.length > 1 ? <Btn testID="queue-approve-all" label={`Approve all ${items.length}`} onPress={async () => { if (items.some((i) => i.destructive) && !(await ui.confirm({ title: "Includes destructive actions", message: items.filter((i) => i.destructive).map((i) => i.label).join("\n"), destructive: true, confirmLabel: "Apply all" }))) return; for (const i of items) await runQueued(i.id); ui.toast("Processed"); }} /> : null}
      {items.length ? items.map((a) => (
        <Glass key={a.id} testID={`queue-item-${a.id}`} style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><T v="headline" style={{ flex: 1 }}>{a.label}</T><Badge label={a.status} tone={a.status === "completed" ? "success" : a.status === "failed" ? "error" : a.status === "pending" ? "warning" : "muted"} /></View>
          <T v="caption" muted>{ACTION_INFO[a.kind as keyof typeof ACTION_INFO]} · from {a.source} · {fmtDT(a.createdAt)}{a.destructive ? " · destructive" : ""}</T>
          {a.result ? <T v="caption">{a.result}</T> : null}
          {a.error ? <T v="caption" testID="queue-error">Error: {a.error}</T> : null}
          <T v="caption" muted>{(a.log ?? []).slice(-3).join("\n")}</T>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {a.status === "pending" ? <><Btn small testID={`queue-approve-${a.id}`} label="Approve" onPress={async () => { if (a.destructive && !(await ui.confirm({ title: "Confirm", message: a.label, destructive: true }))) return; const r = await runQueued(a.id); ui.toast(r.status === "completed" ? r.result : "Failed: " + r.error); }} /><Btn small kind="ghost" label="Cancel" testID={`queue-cancel-${a.id}`} onPress={() => cancelQueued(a.id)} /></> : null}
            {a.status === "failed" ? <Btn small kind="secondary" label="Retry" testID={`queue-retry-${a.id}`} onPress={() => runQueued(a.id)} /> : null}
            {a.status === "completed" && a.undoData ? <Btn small kind="secondary" label="Undo" testID={`queue-undo-${a.id}`} onPress={() => { try { undoQueued(a.id); ui.toast("Undone"); } catch (e: any) { ui.toast(e.message); } }} /> : null}
          </View>
        </Glass>)) : <Empty testID="queue-empty" icon="list-circle-outline" title={`No ${f === "all" ? "" : f} actions`} />}
      {q.length ? <Btn kind="ghost" label="Clear finished history" onPress={() => db.replace("queue", db.get().data.queue.filter((x) => x.status === "pending" || x.status === "failed"), "Clear queue history")} /> : null}
    </Screen>
  );
}
