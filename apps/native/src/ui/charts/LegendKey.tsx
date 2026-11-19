import { View } from 'react-native';
import { Text } from '../Text';

export function LegendKey({ color, label, line = false, dashed = false }: {
  color: string; label: string; line?: boolean; dashed?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        <View style={{ width: line && !dashed ? 12 : 5, height: line ? 2 : 7, borderRadius: 2, backgroundColor: color }} />
        {dashed && <View style={{ width: 5, height: 2, backgroundColor: color }} />}
      </View>
      <Text variant="caption" tone="text2">{label}</Text>
    </View>
  );
}
