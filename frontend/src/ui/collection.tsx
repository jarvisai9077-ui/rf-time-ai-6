// Generic list+form for simple record collections (finance, wellness, family, admin...).
import { ReactNode } from "react";
import { View } from "react-native";
import { Col, db, Item, useCol } from "@/src/store/db";
import { Btn, Divider, Empty, Glass, Row, T } from "./kit";
import { Field, useUI } from "./overlay";

export function CollectionList({ col, fields, filter, title, subtitle, right, defaults, addLabel, emptyTitle, testID, onSaved, left, sort }: {
  col: Col; fields: Field[]; filter?: (i: Item) => boolean; title: (i: Item) => string; subtitle?: (i: Item) => string; right?: (i: Item) => ReactNode; left?: (i: Item) => ReactNode;
  defaults?: Record<string, any>; addLabel: string; emptyTitle: string; testID: string; onSaved?: (i: Item) => void | Promise<void>; sort?: (a: Item, b: Item) => number;
}) {
  const ui = useUI();
  const all = useCol(col);
  const items = (filter ? all.filter(filter) : all).slice().sort(sort ?? (() => 0));
  const open = (it?: Item) => ui.form({ title: it ? "Edit" : addLabel, fields, initial: it ?? defaults, onSubmit: async (v) => {
    const saved = it ? (db.update(col, it.id, v), { ...it, ...v }) : db.add(col, { ...defaults, ...v });
    await onSaved?.(saved as Item);
  }, onDelete: it ? () => { db.remove(col, it.id); ui.toast("Deleted", () => db.undo()); } : undefined });
  return (
    <View style={{ gap: 8 }} testID={testID}>
      {items.length ? <Glass style={{ paddingVertical: 4 }}>{items.map((it, i) => (
        <View key={it.id}>{i ? <Divider /> : null}<Row testID={`${testID}-row-${it.id}`} title={title(it)} subtitle={subtitle?.(it)} left={left?.(it)} right={right?.(it)} onPress={() => open(it)} /></View>
      ))}</Glass> : <Empty testID={`${testID}-empty`} title={emptyTitle} />}
      <Btn testID={`${testID}-add`} kind="secondary" icon="add" label={addLabel} onPress={() => open()} />
      <T v="caption" muted>Tap an entry to edit or delete it.</T>
    </View>
  );
}
