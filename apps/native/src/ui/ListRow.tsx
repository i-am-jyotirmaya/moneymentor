import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { SwitchThumb } from './Switch';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function ListRow({ icon, title, subtitle, value, trailing, onPress, destructive }: {
  icon?: IconName; title: string; subtitle?: string; value?: string | boolean;
  trailing?: 'chevron' | 'switch' | ReactNode; onPress?: () => void; destructive?: boolean;
}) {
  const { color, space } = useTheme();
  const isSwitch = trailing === 'switch';
  const checked = value === true;
  const content = (
    <View style={{ flexDirection: 'row', minHeight: subtitle ? 64 : 56, alignItems: 'center',
      paddingVertical: space.s3, paddingHorizontal: space.s5, gap: space.s4 }}>
      {icon && <Icon name={icon} size={20} color={destructive ? 'negative' : 'text2'} />}
      <View style={{ flex: 1 }}>
        <Text variant="label" tone={destructive ? 'negative' : 'text'}>{title}</Text>
        {subtitle && <Text variant="caption" tone="text2">{subtitle}</Text>}
      </View>
      {typeof value === 'string' && <Text variant="caption" tone="text2" style={{ flexShrink: 1 }}>{value}</Text>}
      {trailing === 'chevron' ? <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={20} color="text2" />
        : isSwitch ? <SwitchThumb value={checked} /> : trailing}
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 56, right: 0,
        height: StyleSheet.hairlineWidth, backgroundColor: color.outline }} />
    </View>
  );
  if (!onPress) return content;
  return (
    <PressableScale onPress={() => {
      if (isSwitch) void Haptics.selectionAsync().catch(() => {});
      onPress();
    }} accessibilityRole={isSwitch ? 'switch' : 'button'}
      accessibilityLabel={[title, subtitle, typeof value === 'string' ? value : undefined].filter(Boolean).join(', ')}
      accessibilityState={isSwitch ? { checked } : undefined}>
      {content}
    </PressableScale>
  );
}
