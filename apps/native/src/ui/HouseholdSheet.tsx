import { useContext } from 'react';
import { View } from 'react-native';
import { Button } from './Button';
import { Icon } from './Icon';
import { initialsFor } from './MoreSheet';
import { PressableScale } from './PressableScale';
import { SheetHeadingContext } from './Sheet';
import { Text } from './Text';
import type { ThemeValue } from './ThemeProvider';
import { useThemedStyles } from './useThemedStyles';

type HouseholdSheetProps = {
  households: { id: string; name: string; kind: string; role: string; members: number }[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

export function roleLabel(role: string) {
  switch (role) {
    case 'owner': return 'Owner';
    case 'write': return 'Can write';
    case 'read': return 'Read only';
    default: return role;
  }
}

const makeStyles = ({ color, radius, space }: ThemeValue) => ({
  content: { paddingHorizontal: space.s5, gap: space.s3 },
  row: {
    minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.s3,
    paddingHorizontal: space.s3, paddingVertical: space.s3, borderRadius: radius.l,
  } as const,
  selected: { backgroundColor: color.primaryContainer },
  avatar: {
    width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.primaryContainer,
    alignItems: 'center', justifyContent: 'center',
  } as const,
  initials: { color: color.onPrimaryContainer },
  details: { flex: 1 },
  metadata: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.s1 } as const,
});

export function HouseholdSheet({ households, currentId, onSelect, onCreate }: HouseholdSheetProps) {
  const s = useThemedStyles(makeStyles);
  const hasSheetHeading = useContext(SheetHeadingContext);
  return (
    <View style={s.content}>
      {!hasSheetHeading && <Text variant="titleL" accessibilityRole="header">Switch household</Text>}
      <Text tone="text2">Each household has its own money, goals and members.</Text>
      {households.map(({ id, name, kind, role, members }) => {
        const selected = id === currentId;
        const memberCount = `${members} ${members === 1 ? 'member' : 'members'}`;
        const summary = [kind, memberCount].filter(Boolean).join(' · ');
        const permission = roleLabel(role);
        return (
          <PressableScale key={id} accessibilityRole="button" accessibilityState={{ selected }}
            accessibilityLabel={[name, kind, memberCount, permission].filter(Boolean).join(', ')}
            onPress={() => onSelect(id)} contentStyle={[s.row, selected && s.selected]}>
            <View style={s.avatar}>
              <Text variant="label" style={s.initials}>{initialsFor(name)}</Text>
            </View>
            <View style={s.details}>
              <Text variant="label">{name}</Text>
              <View style={s.metadata}>
                <Text variant="caption" tone="text2">{summary}{permission ? ' ·' : ''}</Text>
                {role === 'read' && <Icon name={{ ios: 'lock', android: 'lock' }} size={14} color="text2" />}
                {permission && <Text variant="caption" tone="text2">{permission}</Text>}
              </View>
            </View>
            {selected && <Icon name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} color="primaryText" />}
          </PressableScale>
        );
      })}
      <Button label="New household" variant="text" icon={{ ios: 'plus', android: 'add' }} onPress={onCreate} />
    </View>
  );
}
