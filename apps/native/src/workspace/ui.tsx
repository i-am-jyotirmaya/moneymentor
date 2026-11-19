import { WorkspaceBannerVisible } from './banner';
import { useOffline } from './connection';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useContext, useState, type ReactNode } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles } from '../ui/theme';
import { Skeleton } from '../ui/Skeleton';

export const ws = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 16 },
  card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  heading: { fontSize: 18, fontWeight: '600', color: colors.ink },
  small: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  item: { padding: 12, borderRadius: 8, backgroundColor: colors.surface, gap: 8, borderWidth: 1, borderColor: colors.border },
  action: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, flexShrink: 1, minHeight: 48, minWidth: 48, padding: 12, justifyContent: 'center', borderRadius: 8 },
  selected: { backgroundColor: colors.accentSoft },
  scrim: { flex: 1, backgroundColor: '#00000047', justifyContent: 'flex-end' },
});
export function Action({ title, onPress, disabled = false, label, testID, selected = false, icon, hideLabel = false, filled = false, write = false }: { title: string; onPress: () => void; disabled?: boolean; label?: string; testID?: string; selected?: boolean; icon?: SymbolViewProps["name"]; hideLabel?: boolean; filled?: boolean; write?: boolean }) {
  const offline = useOffline();
  disabled = disabled || (write && offline);
  return <Pressable testID={testID} accessibilityRole="button" accessibilityHint={write && offline ? "You're offline. Reconnect before making changes." : undefined} accessibilityLabel={label ?? title} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={[ws.action, selected && ws.selected, filled && { backgroundColor: colors.accent }, disabled && { opacity: 0.45 }]}>{icon ? <SymbolView name={icon} size={20} tintColor={filled ? 'white' : colors.accent} /> : null}<Text style={[filled ? styles.buttonText : styles.link, { flexShrink: 1, textAlign: 'center' }, hideLabel && { display: 'none' }]}>{title}</Text></Pressable>;
}
export function Loading({ label = 'Loading content' }: { label?: string }) {
  return <Skeleton label={label} />;
}
export function ErrorNotice({ error, retry }: { error: string | null; retry: () => void }) {
  const offline = useOffline();
  const bannerVisible = useContext(WorkspaceBannerVisible);
  return error && !offline && !bannerVisible ? <View style={ws.content} accessibilityRole="alert"><Text style={styles.error}>{error}</Text><Action title="Try again" onPress={retry} /></View> : null;
}
export function Choice({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <><Action title={options.find(option => option.value === value)?.label ?? value} label={label} disabled={disabled} onPress={() => { Keyboard.dismiss(); setOpen(true); }} /><Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}><View style={ws.scrim}><SafeAreaView style={{ maxHeight: '85%', backgroundColor: 'white' }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ws.content}><Text style={ws.heading}>{label}</Text>{options.map(option => <Action key={option.value} title={option.label} selected={value === option.value} onPress={() => { onChange(option.value); setOpen(false); }} />)}<Action title="Close" onPress={() => setOpen(false)} /></ScrollView></SafeAreaView></View></Modal></>;
}
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <View style={ws.card}><Text style={ws.heading}>{title}</Text>{children}</View>;
}
