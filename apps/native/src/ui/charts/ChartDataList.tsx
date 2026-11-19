import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../Text';

export function ChartDataList({ label, rows }: { label: string; rows: { key: string; text: string }[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}
        style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <Text variant="labelS" tone="primaryText">{expanded ? 'Hide' : 'View'} {label}</Text>
      </Pressable>
      {expanded && <View style={{ gap: 6 }}>
        {rows.map(row => <Text variant="caption" key={row.key}>{row.text}</Text>)}
      </View>}
    </View>
  );
}
