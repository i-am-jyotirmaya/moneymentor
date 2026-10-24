import { Text, View } from 'react-native';
import { Icon } from './Icon';
import { useStyles } from './primitives';
import { useTheme } from './theme';

export function ChatExchange({ text, reply }: { text: string; reply: string }) {
  const styles = useStyles(); const { color } = useTheme();
  return <View style={{ gap: 14 }}>
    <View style={{ alignSelf: 'flex-end', maxWidth: '92%', padding: 16, borderRadius: 22, borderBottomRightRadius: 6, backgroundColor: color.tint }}>
      <Text style={[styles.caption, { marginBottom: 4 }]}>You</Text><Text selectable style={styles.body}>{text}</Text>
    </View>
    <View style={{ alignSelf: 'flex-start', maxWidth: '96%', gap: 10, padding: 18, borderRadius: 22, borderTopLeftRadius: 6, backgroundColor: color.surface, boxShadow: `0 3px 16px ${color.shadow}` }}>
      <View style={styles.row}><Icon name="brand" size={24} /><Text style={[styles.caption, { fontWeight: '600', color: color.accent }]}>Spndrr</Text></View>
      <Text selectable accessibilityLiveRegion="polite" style={styles.body}>{reply}</Text>
    </View>
  </View>;
}
