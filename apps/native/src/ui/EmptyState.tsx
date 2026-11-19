import { View } from 'react-native';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export type FeedbackAction = { label: string; onPress: () => void };

export function EmptyState({ icon, title, body, action, example }: {
  icon: IconName; title: string; body: string; action?: FeedbackAction; example?: string;
}) {
  const { color, radius, space } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space.s3, padding: space.s5 }}>
      <View style={{ width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center',
        justifyContent: 'center', backgroundColor: color.surfaceTonal }}>
        <Icon name={icon} size={28} color="primaryText" />
      </View>
      <Text variant="title" style={{ textAlign: 'center' }}>{title}</Text>
      <Text variant="body" tone="text2" style={{ textAlign: 'center' }}>{body}</Text>
      {example && <Text variant="caption" tone="text2" style={{ textAlign: 'center' }}>{example}</Text>}
      {action && <View style={{ alignItems: 'center' }}><Button {...action} variant="filled" /></View>}
    </View>
  );
}
