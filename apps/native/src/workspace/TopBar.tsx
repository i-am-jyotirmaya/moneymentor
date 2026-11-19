import type { SymbolViewProps } from 'expo-symbols';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { layout, type } from '../ui/theme';
import { useTheme } from '../ui/ThemeProvider';
import { householdA11yLabel, showHouseholdRole } from './navigation';
import { Icon } from './ui';

export type TopBarAction = { icon: SymbolViewProps['name']; label: string; onPress: () => void };
export type TopBarProps = {
  title: string;
  household?: { name: string; canWrite: boolean } | null;
  onHouseholdPress?: () => void;
  householdExpanded?: boolean;
  /** One action at most. */
  action?: TopBarAction;
  showMark?: boolean;
  /** Only wired in __DEV__; opens the dev-client menu. */
  onMarkLongPress?: () => void;
};

export function TopBar({ title, household, onHouseholdPress, householdExpanded, action, showMark = true, onMarkLongPress }: TopBarProps) {
  const { color, fontScale } = useTheme();
  const showRole = showHouseholdRole(fontScale);
  const mark = <Image source={require('../../assets/spndrr-mark.png')} style={bar.mark} resizeMode="contain" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
  return <View style={[bar.root, { backgroundColor: color.bg }]} testID="top-bar">
    {showMark ? (__DEV__ && onMarkLongPress
      ? <Pressable testID="top-bar-mark" onLongPress={onMarkLongPress} delayLongPress={450} hitSlop={10} accessibilityRole="button" accessibilityLabel="Developer menu" accessibilityHint="Long press to open the developer menu">{mark}</Pressable>
      : mark) : null}
    <View style={bar.titles}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={[type.titleL, { color: color.text }]}>{title}</Text>
      {household ? <Pressable testID="household-switcher" onPress={onHouseholdPress} hitSlop={{ top: 8, bottom: 8 }}
        accessibilityRole="button" accessibilityLabel={householdA11yLabel(household.name, household.canWrite)} accessibilityState={{ expanded: !!householdExpanded }}
        style={({ pressed }) => [bar.household, pressed && bar.pressed]}>
        {/* Name, chevron and role share one Text (one baseline). The chevron follows a no-break space so it never orphans. */}
        <Text maxFontSizeMultiplier={2} style={[type.caption, bar.householdText, { color: color.text2 }]}>
          {!household.canWrite ? <View style={bar.chevron}><Icon name={{ android: 'lock', ios: 'lock' }} tintColor={color.text2} /></View> : null}
          {household.name}{'\u00A0'}<View style={bar.chevron}><Icon name={{ android: 'expand_more', ios: 'chevron.down' }} tintColor={color.text2} /></View>
          {showRole ? `\u00A0· ${household.canWrite ? 'Can write' : 'Read only'}` : ''}
        </Text>
      </Pressable> : null}
    </View>
    {action ? <Pressable testID="top-bar-action" onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}
      style={({ pressed }) => [bar.action, pressed && bar.pressed]}>
      <Icon name={action.icon} tintColor={color.text} />
    </Pressable> : null}
  </View>;
}

const bar = StyleSheet.create({
  root: { minHeight: layout.topBar, paddingHorizontal: layout.gutter, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 28, height: 28, flexShrink: 0 },
  titles: { flex: 1, minWidth: 0 },
  household: { minHeight: 32, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', alignSelf: 'flex-start', columnGap: 2 },
  householdText: { flexShrink: 1 },
  chevron: { width: 20, height: 16, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: 4 }] },
  action: { width: layout.touch, height: layout.touch, alignItems: 'center', justifyContent: 'center', borderRadius: 999, marginRight: -12 },
  pressed: { opacity: 0.6 },
});
