import { ScrollView } from 'react-native';
import { Icon, type IconName } from './Icon';
import { pressScaleSmall } from './motion';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function Chip({ label, selected = false, icon, onPress, testID, count }: {
  label: string; selected?: boolean; icon?: IconName; onPress: () => void; testID?: string; count?: number;
}) {
  const { color, radius, space } = useTheme();
  const glyph = selected ? { ios: 'checkmark', android: 'check' } as const : icon;
  const tone = selected ? 'onPrimaryContainer' : 'text';
  return (
    <PressableScale testID={testID} onPress={onPress} hitSlop={6} accessibilityRole="button"
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`} accessibilityState={{ selected }}
      scaleTo={pressScaleSmall}
      style={{ minHeight: 36, alignItems: 'center', flexDirection: 'row', gap: space.s2,
        paddingHorizontal: space.s4, borderRadius: radius.pill, borderWidth: selected ? 0 : 1,
        borderColor: color.outline, backgroundColor: selected ? color.primaryContainer : color.surface }}>
      {glyph && <Icon name={glyph} size={16} color={tone} />}
      <Text variant="label" style={{ color: color[tone] }}>{label}{count === undefined ? '' : ` ${count}`}</Text>
    </PressableScale>
  );
}

export function FilterChips<K extends string>({ options, value, onChange, testID }: {
  options: { key: K; label: string; count?: number }[]; value: K; onChange: (key: K) => void; testID?: string;
}) {
  const { space } = useTheme();
  return (
    <ScrollView testID={testID} horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.s3, paddingVertical: 6 }}>
      {options.map(({ key, label, count }) => (
        <Chip key={key} testID={`${testID ?? 'filter'}-${key}`} label={label} count={count}
          selected={key === value} onPress={() => onChange(key)} />
      ))}
    </ScrollView>
  );
}
