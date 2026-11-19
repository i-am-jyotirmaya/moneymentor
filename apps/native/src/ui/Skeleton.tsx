import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from './theme';

/** Loading placeholders use the same surface colors as the content they replace. */
export function Skeleton({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Avoid flashing a loader for short reads.
    const timeout = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timeout);
  }, []);
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={[local.container, style]}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[local.card, !visible && { opacity: 0 }]}>
      <View style={[local.line, { width: '48%', height: 20 }]} />
      <View style={[local.line, { width: '78%' }]} />
      <View style={[local.line, { width: '100%' }]} />
      <View style={[local.line, { width: '64%' }]} />
    </View>
  </View>;
}

const local = StyleSheet.create({
  container: { padding: 16, width: '100%' },
  card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 16, gap: 12 },
  line: { height: 12, borderRadius: 6, backgroundColor: colors.surface },
});
