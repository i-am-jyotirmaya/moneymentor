import { ScrollView } from 'react-native';
import { Icon, type IconName } from './Icon';
import { pressScaleSmall } from './motion';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function Chip({ label, selected, icon, onPress, count }: {
  label: string; selected: boolean; icon?: IconName; onPress: () => void; count?: number;
}) {
  const { color, radius, space } = useTheme();
  const title = count === undefined ? label : `${label} (${count})`;
  const glyph = selected ? { ios: 'checkmark', android: 'check' } as const : icon;
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      accessibilityState={{ selected }} scaleTo={pressScaleSmall} style={{ justifyContent: 'center' }}
      contentStyle={{ flexGrow: 0, minHeight: 36, alignItems: 'center', flexDirection: 'row', gap: space.s2,
        paddingHorizontal: space.s4, borderRadius: radius.pill, borderWidth: selected ? 0 : 1,
        borderColor: color.outline, backgroundColor: selected ? color.primaryContainer : 'transparent' }}
      scaleContent={glyph ? <Icon name={glyph} size={16} color={selected ? 'onPrimaryContainer' : 'text'} /> : null}>
      <Text variant="label" style={{ color: selected ? color.onPrimaryContainer : color.text }}>{title}</Text>
    </PressableScale>
  );
}

export function FilterChips({ options, value, onChange }: {
  options: { key: string; label: string; count?: number }[]; value: string; onChange: (key: string) => void;
}) {
  const { space } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s3 }}>
      {options.map(({ key, label, count }) => (
        <Chip key={key} label={label} count={count} selected={key === value} onPress={() => onChange(key)} />
      ))}
    </ScrollView>
  );
}
