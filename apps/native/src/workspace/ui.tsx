import { WorkspaceBannerVisible } from './banner';
import { useOffline } from './connection';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useContext, type ReactNode } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { lightTheme } from '../ui/theme';
import { useTheme } from '../ui/ThemeProvider';
import { useLegacy } from './legacy-styles';
import { Skeleton } from '../ui/Skeleton';

export function iconGlyphSize(box: number, fontScale: number) {
  return box / Math.max(fontScale, 1);
}

export function Icon({ name, tintColor = lightTheme.color.primary }: { name: SymbolViewProps['name']; tintColor?: string }) {
  const { fontScale } = useWindowDimensions();
  return <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
    <SymbolView name={name} size={Platform.OS === 'android' ? iconGlyphSize(20, fontScale) : 20} style={{ width: 20, height: 20 }} tintColor={tintColor} />
  </View>;
}

export function Action({ title, onPress, disabled = false, label, testID, selected = false, icon, hideLabel = false, filled = false, write = false }: { title: string; onPress: () => void; disabled?: boolean; label?: string; testID?: string; selected?: boolean; icon?: SymbolViewProps["name"]; hideLabel?: boolean; filled?: boolean; write?: boolean }) {
  const { ws, styles } = useLegacy();
  const { color } = useTheme();
  const offline = useOffline();
  disabled = disabled || (write && offline);
  return <Pressable testID={testID} accessibilityRole="button" accessibilityHint={write && offline ? "You're offline. Reconnect before making changes." : undefined} accessibilityLabel={label ?? title} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [ws.action, selected && ws.selected, filled && { backgroundColor: color.primary }, pressed && { opacity: 0.7 }, disabled && { opacity: 0.45 }]}>
    {icon ? <Icon name={icon} tintColor={filled ? color.onPrimary : selected ? color.onPrimaryContainer : color.primaryText} /> : null}
    <Text style={[filled ? styles.buttonText : styles.link, selected && { color: color.onPrimaryContainer }, { flexShrink: 1, textAlign: 'center' }, hideLabel && { display: 'none' }]}>{title}</Text>
    {selected && !filled ? <Icon name={{ android: 'check', ios: 'checkmark' }} tintColor={color.onPrimaryContainer} /> : null}
  </Pressable>;
}
export function Loading({ label = 'Loading content' }: { label?: string }) {
  return <Skeleton label={label} />;
}
export function ErrorNotice({ error, retry }: { error: string | null; retry: () => void }) {
  const { ws, styles } = useLegacy();
  const offline = useOffline();
  const bannerVisible = useContext(WorkspaceBannerVisible);
  return error && !offline && !bannerVisible ? <View style={ws.content} accessibilityRole="alert"><Text style={styles.error}>{error}</Text><Action title="Try again" onPress={retry} /></View> : null;
}
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  const { ws } = useLegacy();
  return <View style={ws.card}><Text accessibilityRole="header" style={ws.heading}>{title}</Text>{children}</View>;
}
