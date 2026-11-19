// TODO(A2): replace with A2 Segmented (spring.indicator thumb).
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../ThemeProvider';

export function Segmented<K extends string>({ options, value, onChange, label }: { options: { key: K; label: string }[]; value: K; onChange: (key: K) => void; label: string }) {
  const { color, elevation, radius, type } = useTheme();
  return <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: color.surfaceSunken, borderRadius: radius.m, padding: 4 }}>
    {options.map(option => {
      const selected = option.key === value;
      return <Pressable key={option.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(option.key)} hitSlop={4}
        style={[{ minWidth: 56, minHeight: 40, paddingHorizontal: 12, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center' }, selected && [{ backgroundColor: color.surface }, elevation.level1]]}>
        <Text style={[type.label, { color: selected ? color.text : color.text2 }]}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}
