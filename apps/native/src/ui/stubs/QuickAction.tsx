// TODO(A2): replace with A2 QuickAction.
import { Text, View } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

export function QuickAction({ icon, label, primary = false, onPress, testID }: { icon: IconName; label: string; primary?: boolean; onPress: () => void; testID?: string }) {
  const { color, elevation, radius, scheme, type } = useTheme();
  return <PressableScale testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} layer={primary ? 'on-primary' : 'primary'}
    style={{ minWidth: 64, minHeight: 80, alignItems: 'center', gap: 8, backgroundColor: 'transparent' }}>
    <View style={[{ width: 56, height: 56, borderRadius: radius.l, alignItems: 'center', justifyContent: 'center',
      backgroundColor: primary ? color.primary : scheme === 'dark' ? color.surfaceRaised : color.surface }, !primary && scheme !== 'dark' ? elevation.level1 : null]}>
      <Icon name={icon} color={primary ? color.onPrimary : color.primaryText} />
    </View>
    <Text maxFontSizeMultiplier={1.5} numberOfLines={2} style={[type.labelS, { color: color.text, textAlign: 'center' }]}>{label}</Text>
  </PressableScale>;
}
