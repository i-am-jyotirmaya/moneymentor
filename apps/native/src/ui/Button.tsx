import { ActivityIndicator } from 'react-native';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import type { ColorRole, Theme } from './theme';

export type ButtonVariant = 'filled' | 'tonal' | 'outline' | 'text' | 'danger-text';

const foreground: Record<ButtonVariant, ColorRole> = {
  filled: 'onPrimary', tonal: 'onPrimaryContainer', outline: 'primaryText',
  text: 'primaryText', 'danger-text': 'negative',
};

export function buttonColors({ color }: Theme, variant: ButtonVariant) {
  return {
    background: variant === 'filled' ? color.primary : variant === 'tonal' ? color.primaryContainer : 'transparent',
    text: color[foreground[variant]],
    border: variant === 'outline' ? color.outlineStrong : 'transparent',
    pressed: variant === 'filled' ? color.primaryPressed : undefined,
  };
}

export function Button({ label, onPress, variant = 'filled', size = 'l', icon, loading = false,
  disabled = false, fullWidth = false }: {
  label: string; onPress: () => void; variant?: ButtonVariant; size?: 'l' | 'm';
  icon?: IconName; loading?: boolean; disabled?: boolean; fullWidth?: boolean;
}) {
  const theme = useTheme();
  const colors = buttonColors(theme, variant);
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }} onPress={onPress}
      disabled={disabled || loading} layer={variant === 'filled' ? 'on-primary' : 'primary'}
      pressedBackground={colors.pressed} style={{ alignSelf: fullWidth ? 'stretch' : 'flex-start', opacity: disabled ? 0.45 : 1 }}
      contentStyle={{ minHeight: size === 'l' ? 56 : 48, borderRadius: theme.radius.l, paddingHorizontal: theme.space.s5,
        paddingVertical: theme.space.s3, flexDirection: 'row', alignItems: 'center', gap: theme.space.s3,
        backgroundColor: colors.background, borderColor: colors.border, borderWidth: variant === 'outline' ? 1 : 0 }}>
      {loading ? <ActivityIndicator color={colors.text} /> : icon && <Icon name={icon} size={20} color={foreground[variant]} />}
      <Text variant="label" style={{ color: colors.text, flexShrink: 1, textAlign: 'center' }}>{label}</Text>
    </PressableScale>
  );
}
