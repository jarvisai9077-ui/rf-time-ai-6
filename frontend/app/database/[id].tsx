import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, Item, uid, useCol } from "@/src/store/db";
import { radius, type, useTheme } from "@/src/theme";
import { fmtDay } from "@/src/engine/time";
import { saveAndShare, toCSV } from "@/src/engine/io";
import { Badge, Btn, ChipRow, Divider, Fab, Glass, IconBtn, Row, Screen, T } from "@/src/ui/kit";
import { Field, useUI } from "@/src/ui/overlay";

const TYPES = ["text", "number", "date", "checkbox", "select", "multiselect", "relation"];

export default function DatabaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets(); const ui = useUI(); const { colors } = useTheme();
  useCol("databases");
  const d = db.find("databases", id);
  const [viewId, setViewId] = useState("v0");
  const [q, setQ] = useState("");
  const fields: Item[] = d?.fields ?? []; const records: Item[] = d?.records ?? []; const views: Item[] = d?.views?.length ? d.views : [{ id: "v0", name: "All" }];
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const rows = useMemo(() => {
    let xs = records.filter((r) => !q || JSON.stringify(r.values).toLowerCase().includes(q.toLowerCase()));
    if (view.filterField && view.filterValue) xs = xs.filter((r) => String(r.values[view.filterField] ?? "").toLowerCase().includes(String(view.filterValue).toLowerCase()));
    if (view.sortField) xs = [...xs].sort((a, b) => { const x = a.values[view.sortField], y = b.values[view.sortField]; const c = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? "")); return view.dir === "desc" ? -c : c; });
    return xs;
  }, [records, q, view]);
  if (!d) return <Screen title="Database"><T>Not found.</T></Screen>;
  const toField = (f: Item): Field => ({ key: f.id, label: f.name, type: f.type === "checkbox" ? "toggle" : f.type === "relation" ? "select" : f.type === "select" ? "select" : f.type === "multiselect" ? "multiselect" : f.type === "number" ? "number" : f.type === "date" ? "date" : "text", options: f.type === "relation" ? (db.find("databases", f.relDb)?.records ?? []).map((r: Item) => ({ label: String(Object.values(r.values)[0] ?? r.id), value: r.id })) : (f.options ?? []).map((o: string) => ({ label: o, value: o })) });
  const save = (patch: any, label: string) => db.update("databases", d.id, patch, label);
  const recForm = (r?: Item) => ui.form({ title: r ? "Edit record" : "New record", fields: fields.map(toField), initial: r?.values ?? (d.recordTemplate ?? {}), onSubmit: (v) => {
    if (r) save({ records: records.map((x) => (x.id === r.id ? { ...x, values: v } : x)) }, "Edit record"); else save({ records: [{ id: uid(), values: v }, ...records] }, "Add record");
  }, onDelete: r ? () => { save({ records: records.filter((x) => x.id !== r.id) }, "Delete record"); ui.toast("Record deleted", () => db.undo()); } : undefined,
    extra: !r ? undefined : <Btn small kind="secondary" label="Duplicate" onPress={() => { save({ records: [{ id: uid(), values: { ...r.values } }, ...records] }, "Duplicate record"); ui.closeForm(); }} /> });
  const fieldForm = () => ui.form({ title: "Add property", fields: [{ key: "name", label: "Name", type: "text", required: true }, { key: "type", label: "Type", type: "select", required: true, options: TYPES.map((t) => ({ label: t, value: t })) }, { key: "options", label: "Options (for select)", type: "tags" }, { key: "relDb", label: "Relation to database", type: "select", options: db.list("databases").map((x) => ({ label: x.name, value: x.id })) }], initial: { type: "text" },
    onSubmit: (v) => { if (fields.some((f) => f.name.toLowerCase() === v.name.toLowerCase())) return "A property with this name exists."; save({ fields: [...fields, { id: uid(), ...v }] }, "Add property"); } });
  const viewForm = () => ui.form({ title: "New saved view", fields: [{ key: "name", label: "View name", type: "text", required: true }, { key: "sortField", label: "Sort by", type: "select", options: fields.map((f) => ({ label: f.name, value: f.id })) }, { key: "dir", label: "Direction", type: "select", options: [{ label: "Ascending", value: "asc" }, { label: "Descending", value: "desc" }] }, { key: "filterField", label: "Filter property", type: "select", options: fields.map((f) => ({ label: f.name, value: f.id })) }, { key: "filterValue", label: "Filter contains", type: "text" }, { key: "groupField", label: "Group by", type: "select", options: fields.map((f) => ({ label: f.name, value: f.id })) }],
    onSubmit: (v) => { const nv = { id: uid(), ...v }; save({ views: [...views, nv] }, "Add view"); setViewId(nv.id); } });
  const show = (f: Item, v: any) => v === undefined || v === "" || v === null ? "—" : f.type === "checkbox" ? (v ? "✓" : "✗") : f.type === "date" ? fmtDay(v) : Array.isArray(v) ? v.join(", ") : f.type === "relation" ? String(Object.values(db.find("databases", f.relDb)?.records?.find((r: Item) => r.id === v)?.values ?? {})[0] ?? v) : String(v);
  const groups: [string, Item[]][] = view.groupField ? Object.entries(rows.reduce((a: any, r) => { const k = show(fields.find((f) => f.id === view.groupField)!, r.values[view.groupField]); (a[k] ||= []).push(r); return a; }, {})) : [["", rows]];
  return (
    <View style={{ flex: 1 }}>
      <Screen testID="database-detail-screen" title={d.name} subtitle={`${records.length} records`} bottomPad={insets.bottom + 100}
        right={<><IconBtn testID="db-add-field" label="Add property" icon="add-circle-outline" onPress={fieldForm} /><IconBtn testID="db-more" label="More" icon="ellipsis-horizontal" onPress={() => ui.sheet("Database", (
          <View style={{ gap: 8 }}>
            <Btn kind="secondary" label="Export CSV" icon="share-outline" testID="db-export-csv" onPress={async () => { try { ui.toast(await saveAndShare(`${d.name}.csv`, toCSV(fields.map((f) => f.name), records.map((r) => fields.map((f) => r.values[f.id]))), "text/csv")); } catch (e: any) { ui.toast(e.message); } }} />
            <Btn kind="secondary" label="New saved view" icon="eye-outline" onPress={() => { ui.closeSheet(); setTimeout(viewForm, 250); }} />
            <Btn kind="secondary" label="Set record template" icon="copy-outline" onPress={() => { ui.closeSheet(); setTimeout(() => ui.form({ title: "Record template (defaults)", fields: fields.map(toField), initial: d.recordTemplate, onSubmit: (v) => { save({ recordTemplate: v }, "Template"); } }), 250); }} />
            <Btn kind="secondary" label="Rename" onPress={() => { ui.closeSheet(); setTimeout(() => ui.form({ title: "Rename", fields: [{ key: "name", label: "Name", type: "text", required: true }], initial: d, onSubmit: (v) => { save(v, "Rename"); } }), 250); }} />
            <Btn kind="secondary" label={d.locked ? "Unlock editing" : "Lock (read-only for profiles)"} onPress={() => { save({ locked: !d.locked }, "Lock"); ui.closeSheet(); }} />
            <Btn kind="ghost" label={d.pinned ? "Unpin" : "Pin to Today"} onPress={() => save({ pinned: !d.pinned }, "Pin")} />
            <T v="headline">Properties</T>
            {fields.map((f) => <Row key={f.id} title={f.name} subtitle={f.type + (f.options?.length ? ": " + f.options.join(", ") : "")} right={fields.length > 1 ? <IconBtn label="Remove property" icon="trash-outline" onPress={async () => { if (await ui.confirm({ title: `Remove "${f.name}"?`, message: "Values in this column will be hidden (undo available).", destructive: true })) { save({ fields: fields.filter((x) => x.id !== f.id) }, "Remove property"); ui.closeSheet(); } }} /> : undefined} />)}
            <Btn kind="danger" label="Delete database" onPress={async () => { if (await ui.confirm({ title: "Delete database?", message: d.name, destructive: true })) { db.remove("databases", d.id); ui.closeSheet(); router.back(); } }} />
          </View>))} /></>}
        header={<View>
          <TextInput testID="db-search-input" value={q} onChangeText={setQ} placeholder="Search records" placeholderTextColor={colors.muted} style={[type.body, { height: 40, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 14, color: colors.onSurface, marginTop: 6 }]} />
          <ChipRow testID="db-views" value={view.id} onChange={setViewId} options={views.map((v) => ({ label: v.name, value: v.id }))} />
        </View>}>
        {d.locked ? <Badge label="read-only" tone="warning" /> : null}
        {groups.map(([g, rs]) => (
          <View key={g} style={{ gap: 6 }}>
            {g ? <T v="headline">{g} ({rs.length})</T> : null}
            <Glass style={{ paddingVertical: 4 }}>{rs.length ? rs.map((r, i) => (
              <View key={r.id}>{i ? <Divider /> : null}
                <Row testID={`db-record-${r.id}`} title={show(fields[0], r.values[fields[0]?.id])} subtitle={fields.slice(1, 4).map((f) => `${f.name}: ${show(f, r.values[f.id])}`).join(" · ")} onPress={() => (d.locked ? ui.toast("Database is locked") : recForm(r))} />
              </View>)) : <T muted>No records.</T>}</Glass>
          </View>))}
      </Screen>
      {!d.locked ? <Fab testID="db-add-record-fab" bottom={insets.bottom + 16} onPress={() => recForm()} /> : null}
    </View>
  );
}
