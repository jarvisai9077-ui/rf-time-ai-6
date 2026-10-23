import * as DocumentPicker from "expo-document-picker";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { db, useCol } from "@/src/store/db";
import { daysUntil, fmtDay } from "@/src/engine/time";
import { scheduleReminder } from "@/src/engine/notify";
import { Badge, Btn, ChipRow, Screen, T } from "@/src/ui/kit";
import { CollectionList } from "@/src/ui/collection";
import { useUI } from "@/src/ui/overlay";

const KINDS = ["document", "subscription", "warranty", "renewal", "service", "checklist"];

// Copies an attachment into the app's private document folder (never uploaded).
async function attach(): Promise<{ uri: string; name: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  if (Platform.OS === "web") return { uri: a.uri, name: a.name };
  const { File, Directory, Paths } = require("expo-file-system");
  const dir = new Directory(Paths.document, "admin");
  if (!dir.exists) dir.create();
  const dest = new File(dir, `${Date.now()}-${a.name}`);
  new File(a.uri).copy(dest);
  return { uri: dest.uri, name: a.name };
}

export default function Admin() {
  const insets = useSafeAreaInsets(); const ui = useUI();
  const [kind, setKind] = useState("all");
  const items = useCol("admin");
  const soon = items.filter((i) => i.expiry && daysUntil(i.expiry) <= 30);
  return (
    <Screen testID="admin-screen" title="Life Admin" subtitle={`${items.length} records · ${soon.length} expiring ≤30d`} bottomPad={insets.bottom + 40}
      header={<ChipRow testID="admin-kind" value={kind} onChange={setKind} options={[{ label: "All", value: "all" }, ...KINDS.map((k) => ({ label: k[0].toUpperCase() + k.slice(1) + "s", value: k }))]} />}>
      <CollectionList testID="admin" col="admin" filter={(i) => kind === "all" || i.kind === kind} defaults={{ kind: kind === "all" ? "document" : kind, remindDays: 14 }} addLabel="Add record" emptyTitle="No records" sort={(a, b) => (a.expiry ?? "9").localeCompare(b.expiry ?? "9")}
        fields={[{ key: "title", label: "Title", type: "text", required: true }, { key: "kind", label: "Type", type: "select", required: true, options: KINDS.map((k) => ({ label: k, value: k })) }, { key: "expiry", label: "Expiry / renewal / service date", type: "date" }, { key: "cost", label: "Cost", type: "number" }, { key: "cycle", label: "Billing cycle", type: "select", options: ["monthly", "yearly", "one-off"].map((x) => ({ label: x, value: x })) }, { key: "remindDays", label: "Remind days before", type: "number" }, { key: "description", label: "Description / reference (avoid full ID numbers)", type: "multiline" }, { key: "checklist", label: "Checklist items (comma separated)", type: "tags" }]}
        title={(i) => i.title} subtitle={(i) => [i.kind, i.expiry ? `${daysUntil(i.expiry) < 0 ? "expired" : "expires"} ${fmtDay(i.expiry)}` : null, i.cost ? `cost ${i.cost}${i.cycle ? "/" + i.cycle : ""}` : null, i.attachmentName ? "📎 " + i.attachmentName : null, i.checklist?.length ? `${i.checklist.length} checklist items` : null].filter(Boolean).join(" · ")}
        right={(i) => i.expiry && daysUntil(i.expiry) <= 30 ? <Badge label={daysUntil(i.expiry) < 0 ? "expired" : `${daysUntil(i.expiry)}d`} tone={daysUntil(i.expiry) < 0 ? "error" : "warning"} /> : undefined}
        onSaved={async (i) => { if (i.expiry) { const at = new Date(i.expiry); at.setDate(at.getDate() - (i.remindDays ?? 14)); at.setHours(9, 0, 0, 0); if (at > new Date()) await scheduleReminder(`Expiring soon: ${i.title}`, at, { kind: "expiry", refId: i.id }); } }} />
      <Btn kind="secondary" icon="attach" label="Attach a file to the latest record" testID="admin-attach" onPress={async () => {
        const latest = items[0]; if (!latest) return ui.toast("Add a record first");
        try { const f = await attach(); if (!f) return; db.update("admin", latest.id, { attachmentUri: f.uri, attachmentName: f.name }); ui.toast(`Attached to "${latest.title}" (stored privately on device)`); } catch (e: any) { ui.toast("Attach failed: " + (e?.message ?? e)); }
      }} />
      <View><T v="caption" muted>Files are copied into this app's private storage and never uploaded. They are protected by Android's app sandbox and device encryption, not by additional app-level encryption. Exported backups contain record text but not attachment files.</T></View>
    </Screen>
  );
}
