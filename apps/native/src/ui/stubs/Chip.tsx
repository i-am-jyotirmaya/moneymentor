// TODO(A2): replace with A2 Chip / FilterChips.
import { ScrollView, Text } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

export function Chip({ label, selected = false, icon, onPress, testID, count }: { label: string; selected?: boolean; icon?: IconName; onPress: () => void; testID?: string; count?: number }) {
  const { color, radius, type } = useTheme();
  return <PressableScale testID={testID} onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={count === undefined ? label : `${label}, ${count}`} accessibilityState={{ selected }}
    style={{ minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: selected ? color.text : color.surface, borderWidth: selected ? 0 : 1, borderColor: color.outlineStrong }}>
    {icon ? <Icon name={icon} size={18} color={selected ? color.bg : color.text2} /> : null}
    <Text style={[type.label, { color: selected ? color.bg : color.text }]}>{label}{count === undefined ? '' : ` ${count}`}</Text>
  </PressableScale>;
}

export function FilterChips<K extends string>({ options, value, onChange, testID }: { options: { key: K; label: string; count?: number }[]; value: K; onChange: (key: K) => void; testID?: string }) {
  return <ScrollView testID={testID} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
    {options.map(option => <Chip key={option.key} testID={`${testID ?? 'filter'}-${option.key}`} label={option.label} count={option.count} selected={option.key === value} onPress={() => onChange(option.key)} />)}
  </ScrollView>;
}
