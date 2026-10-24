import { Pressable, Text, View } from 'react-native';
import { Icon } from './Icon';
import { useStyles } from './primitives';
import { useTheme, type Appearance } from './theme';

export function AppearanceSwitch() {
  const { color, preference, setPreference, error } = useTheme(); const styles = useStyles();
  return <View style={{ gap: 12 }}>
    <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={{ flexDirection: 'row', padding: 5, borderRadius: 20, backgroundColor: color.tint, gap: 4 }}>
      {(['light', 'dark', 'system'] as Appearance[]).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value[0]!.toUpperCase()}${value.slice(1)} mode`}
        accessibilityState={{ checked: preference === value }} onPress={() => setPreference(value)}
        style={{ flex: 1, minHeight: 64, padding: 8, gap: 5, justifyContent: 'center', alignItems: 'center', borderRadius: 16,
          backgroundColor: preference === value ? color.surface : 'transparent', boxShadow: preference === value ? `0 2px 10px ${color.shadow}` : undefined }}>
        <Icon name={value === 'light' ? 'sun' : value === 'dark' ? 'moon' : 'system'} size={20} tint={preference === value ? color.accent : color.muted} />
        <Text style={[styles.caption, { color: preference === value ? color.ink : color.muted, fontWeight: '600' }]}>{value[0]!.toUpperCase()}{value.slice(1)}</Text>
      </Pressable>)}
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
