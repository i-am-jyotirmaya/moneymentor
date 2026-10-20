import { Text, View } from 'react-native';
import { Button, Card, styles } from './primitives';
import { useWorkspace } from '../state/workspace';

export function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year ?? 2026, (number ?? 1) - 1 + delta, 1)).toISOString().slice(0, 7);
}
export function MonthControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { today } = useWorkspace();
  return <View style={[styles.row, { justifyContent: 'space-between' }]}>
    <Button title="‹" accessibilityLabel="Previous month" secondary onPress={() => onChange(shiftMonth(value, -1))} />
    <Text accessibilityRole="header" style={styles.heading}>{value}</Text>
    <Button title="›" accessibilityLabel="Next month" secondary disabled={value >= today.slice(0, 7)} onPress={() => onChange(shiftMonth(value, 1))} />
  </View>;
}
export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <Card><Text style={styles.heading}>{title}</Text>{detail ? <Text style={styles.caption}>{detail}</Text> : null}</Card>;
}
export function ScopeLabel() {
  const { household } = useWorkspace();
  return <Text style={styles.caption}>{household?.name ?? 'Personal workspace'}{household ? ` · ${household.role}` : ''}</Text>;
}
export const choices = <T extends string>(values: readonly T[]) => values.map(id => ({ id, label: id.replace(/([a-z])([A-Z])/g, '$1 $2') }));
