// TODO(A2): replace with A2 EmptyState.
import { Text, View } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: { label: string; onPress: () => void } }) {
  const { color, radius, type } = useTheme();
  return <View style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: color.surfaceTonal, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={28} color={color.primaryText} /></View>
    <Text accessibilityRole="header" style={[type.title, { color: color.text, textAlign: 'center' }]}>{title}</Text>
    <Text style={[type.body, { color: color.text2, textAlign: 'center' }]}>{body}</Text>
    {action ? <PressableScale onPress={action.onPress} accessibilityRole="button" style={{ minHeight: 48, paddingHorizontal: 20, borderRadius: radius.l, backgroundColor: color.primaryContainer, justifyContent: 'center' }}>
      <Text style={[type.label, { color: color.onPrimaryContainer }]}>{action.label}</Text>
    </PressableScale> : null}
  </View>;
}
