import { StyleSheet, View } from 'react-native';
import { Badge } from './Badge';
import { Icon, type IconName } from './Icon';
import { ListRow } from './ListRow';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import type { ThemeValue } from './ThemeProvider';
import { useThemedStyles } from './useThemedStyles';

type MoreSheetProps = {
  user: { name: string; email: string; plan: string };
  items: { key: string; icon: IconName; label: string; subtitle?: string; badge?: number }[];
  onSelect: (key: string) => void;
  onSignOut: () => void;
};

export function initialsFor(name: string) {
  const words = name.trim().split(/\s+/);
  const first = Array.from(words[0] ?? '')[0] ?? '';
  const last = words.length > 1 ? Array.from(words[words.length - 1]!)[0] ?? '' : '';
  return (first + last).toUpperCase();
}

const makeStyles = ({ color, space, radius }: ThemeValue) => ({
  user: {
    flexDirection: 'row', alignItems: 'center', gap: space.s3,
    paddingHorizontal: space.s5, paddingVertical: space.s4,
  } as const,
  avatar: {
    width: 48, height: 48, borderRadius: radius.pill, backgroundColor: color.primaryContainer,
    alignItems: 'center', justifyContent: 'center',
  } as const,
  initials: { color: color.onPrimaryContainer },
  identity: { flex: 1, minWidth: 0 },
  identityHeader: { flexDirection: 'row', alignItems: 'center', gap: space.s2 } as const,
  name: { flexShrink: 1, flexGrow: 1 },
  count: { flexDirection: 'row', alignItems: 'center', gap: space.s4 } as const,
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: color.outline,
    marginHorizontal: space.s5, marginVertical: space.s2,
  },
});

export function MoreSheet({ user, items, onSelect, onSignOut }: MoreSheetProps) {
  const s = useThemedStyles(makeStyles);
  return (
    <View>
      <View style={s.user}>
        <View style={s.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text variant="titleL" style={s.initials}>{initialsFor(user.name)}</Text>
        </View>
        <View style={s.identity}>
          <View style={s.identityHeader}>
            <Text variant="titleL" style={s.name}>{user.name}</Text>
            <Badge tone="primary" label={user.plan} />
          </View>
          <Text variant="caption" tone="text2" numberOfLines={1} ellipsizeMode="middle" accessibilityLabel={user.email}>{user.email}</Text>
        </View>
      </View>
      <View style={s.divider} />
      {items.map(({ key, icon, label, subtitle, badge = 0 }) => badge > 0 ? (
        <PressableScale key={key} accessibilityRole="button"
          accessibilityLabel={[label, subtitle, `${badge} new`].filter(Boolean).join(', ')}
          onPress={() => onSelect(key)}>
          <ListRow icon={icon} title={label} subtitle={subtitle} trailing={
            <View style={s.count}>
              <Badge tone="warning" label={String(badge)} />
              <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={20} color="text2" />
            </View>
          } />
        </PressableScale>
      ) : (
        <ListRow key={key} icon={icon} title={label} subtitle={subtitle}
          trailing="chevron" onPress={() => onSelect(key)} />
      ))}
      <View style={s.divider} />
      <ListRow title="Sign out" icon={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout' }}
        destructive onPress={onSignOut} />
    </View>
  );
}
