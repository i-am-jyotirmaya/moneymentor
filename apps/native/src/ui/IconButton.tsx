import { View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { pressScaleSmall } from './motion';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function IconButton({ icon, label, variant = 'plain', badge, onPress }: {
  icon: IconName; label: string; variant?: 'plain' | 'tonal'; badge?: number; onPress: () => void;
}) {
  const { color, radius } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      accessibilityValue={badge === undefined ? undefined : { text: String(badge) }}
      scaleTo={pressScaleSmall} style={{ alignItems: 'center', justifyContent: 'center' }}
      contentStyle={{ flexGrow: 0, width: 40, height: 40, alignItems: 'center', borderRadius: radius.pill,
        backgroundColor: variant === 'tonal' ? color.primaryContainer : 'transparent' }}
      scaleContent={<Icon name={icon} color={variant === 'tonal' ? 'onPrimaryContainer' : 'text'} />}>
      {badge !== undefined && (
        <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, paddingHorizontal: 3,
          alignItems: 'center', borderRadius: radius.pill, backgroundColor: color.primary }}>
          <Text variant="labelS" style={{ color: color.onPrimary }}>{badge}</Text>
        </View>
      )}
    </PressableScale>
  );
}
