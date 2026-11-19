import { View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import type { Theme } from './theme';

export type BadgeTone = 'primary' | 'income' | 'negative' | 'warning' | 'info' | 'dev';

const roles = {
  primary: ['primaryContainer', 'onPrimaryContainer'],
  income: ['incomeContainer', 'income'],
  negative: ['negativeContainer', 'negative'],
  warning: ['warningContainer', 'warning'],
  info: ['infoContainer', 'info'],
  dev: ['surfaceSunken', 'text2'],
} as const;

export function badgeColors({ color }: Theme, tone: BadgeTone) {
  const [background, text] = roles[tone];
  return { background: color[background], text: color[text] };
}

export function Badge({ tone, icon, label }: { tone: BadgeTone; icon?: IconName; label: string }) {
  const theme = useTheme();
  const colors = badgeColors(theme, tone);
  return (
    <View style={{ alignSelf: 'flex-start', minHeight: 22, flexDirection: 'row', alignItems: 'center',
      borderRadius: theme.radius.pill, paddingHorizontal: theme.space.s3, gap: theme.space.s2,
      backgroundColor: colors.background }}>
      {icon && <Icon name={icon} size={14} color={roles[tone][1]} />}
      <Text variant="labelS" style={{ color: colors.text, flexShrink: 1 }}>{label}</Text>
    </View>
  );
}
