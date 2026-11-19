import { View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function QuickAction({ icon, label, primary = false, onPress }: {
  icon: IconName; label: string; primary?: boolean; onPress: () => void;
}) {
  const { color, scheme, radius, elevation, space } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      layer={primary ? 'on-primary' : 'primary'}
      stateLayerStyle={{ left: '50%', marginLeft: -28, right: undefined, bottom: undefined,
        width: 56, height: 56, borderRadius: radius.l }}
      style={{ minWidth: 64, minHeight: 80 }}
      contentStyle={{ alignItems: 'center', justifyContent: 'flex-start', gap: space.s2 }}>
      <View style={[{ width: 56, height: 56, borderRadius: radius.l, alignItems: 'center', justifyContent: 'center',
        backgroundColor: primary ? color.primary : scheme === 'dark' ? color.surfaceRaised : color.surface },
        !primary && scheme === 'light' && elevation.level1]}>
        <Icon name={icon} color={primary ? 'onPrimary' : 'primaryText'} />
      </View>
      <Text variant="labelS" style={{ textAlign: 'center' }}>{label}</Text>
    </PressableScale>
  );
}
