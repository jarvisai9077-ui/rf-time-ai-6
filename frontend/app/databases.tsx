import { router } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, useCol } from "@/src/store/db";
import { fromCSV, pickText } from "@/src/engine/io";
import { Empty, Fab, Glass, IconBtn, Row, Screen, Divider } from "@/src/ui/kit";
import { useUI } from "@/src/ui/overlay";

const TEMPLATES: Record<string, { name: string; type: string; options?: string[] }[]> = {
  "Reading list": [{ name: "Title", type: "text" }, { name: "Author", type: "text" }, { name: "Status", type: "select", options: ["To read", "Reading", "Done"] }, { name: "Rating", type: "number" }],
  "Contacts": [{ name: "Name", type: "text" }, { name: "Phone", type: "text" }, { name: "Birthday", type: "date" }, { name: "Tags", type: "multiselect", options: ["Family", "Friend", "Work"] }],
  "Inventory": [{ name: "Item", type: "text" }, { name: "Qty", type: "number" }, { name: "Location", type: "text" }, { name: "In stock", type: "checkbox" }],
  "Blank": [{ name: "Name", type: "text" }],
};

export default function Databases() {
  const insets = useSafeAreaInsets(); const ui = useUI();
  const dbs = useCol("databases");
  const create = () => ui.form({ title: "New database", fields: [{ key: "name", label: "Name", type: "text", required: true }, { key: "tpl", label: "Template", type: "select", required: true, options: Object.keys(TEMPLATES).map((k) => ({ label: k, value: k })) }, { key: "workspaceId", label: "Workspace", type: "select", options: db.list("workspaces").map((w) => ({ label: w.name, value: w.id })) }],
    initial: { tpl: "Blank" }, onSubmit: (v) => { const d = db.add("databases", { name: v.name, workspaceId: v.workspaceId, fields: TEMPLATES[v.tpl].map((f, i) => ({ id: "f" + i, ...f })), records: [], views: [{ id: "v0", name: "All" }] }); router.push(`/database/${d.id}` as any); } });
  const importCSV = async () => {
    try {
      const f = await pickText(); if (!f) return;
      const rows = fromCSV(f.text); if (rows.length < 1) throw new Error("CSV is empty.");
      const [h, ...body] = rows;
      const fields = h.map((name, i) => ({ id: "f" + i, name: name || `Column ${i + 1}`, type: body.every((r) => r[i] === "" || !isNaN(Number(r[i]))) && body.length ? "number" : "text" }));
      const d = db.add("databases", { name: f.name.replace(/\.csv$/i, ""), fields, records: body.map((r, ri) => ({ id: `r${Date.now().toString(36)}${ri}`, values: Object.fromEntries(fields.map((fl, i) => [fl.id, fl.type === "number" && r[i] !== "" ? Number(r[i]) : r[i] ?? ""])) })), views: [{ id: "v0", name: "All" }] });
      ui.toast(`Imported ${body.length} records`); router.push(`/database/${d.id}` as any);
    } catch (e: any) { ui.toast("Import failed: " + e.message); }
  };
  return (
    <View style={{ flex: 1 }}>
      <Screen testID="databases-screen" title="Databases" subtitle="Custom tables with views" bottomPad={insets.bottom + 100} right={<IconBtn testID="db-import-csv" label="Import CSV" icon="download-outline" onPress={importCSV} />}>
        {dbs.length ? <Glass>{dbs.map((d, i) => <View key={d.id}>{i ? <Divider /> : null}<Row testID={`db-row-${d.id}`} title={d.name} subtitle={`${d.records?.length ?? 0} records · ${d.fields?.length ?? 0} properties`} onPress={() => router.push(`/database/${d.id}` as any)} /></View>)}</Glass>
          : <Empty testID="databases-empty" icon="grid-outline" title="No databases" body="Track anything: books, contacts, inventory." action="New database" onAction={create} />}
      </Screen>
      <Fab testID="databases-add-fab" bottom={insets.bottom + 16} onPress={create} />
    </View>
  );
}
