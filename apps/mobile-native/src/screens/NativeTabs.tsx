import { Pressable, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from './Home';
import { DashboardScreen } from './Dashboard';
import { GoalsScreen } from './Goals';
import { InsightsScreen } from './Insights';
import { Page } from '../ui/forms';
import { Card, KeyboardDismissButton, useStyles } from '../ui/primitives';
import { useTheme } from '../ui/theme';
import { Icon, type IconName } from '../ui/Icon';
import { AppearanceSwitch } from '../ui/AppearanceSwitch';
import { ScopeLabel } from '../ui/workspace';
import type { FeatureNavigationProps, ScreenProps } from '../navigation';

const Tabs = createBottomTabNavigator<{ Today: undefined; Overview: undefined; Plan: undefined; Insights: undefined; More: undefined }>();
function MenuRow({ title, detail, icon, onPress }: { title: string; detail: string; icon: IconName; onPress: () => void }) {
  const styles = useStyles(); const { color } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 76, paddingVertical: 12, gap: 14, opacity: pressed ? 0.6 : 1 })}>
    <View style={{ padding: 12, borderRadius: 16, backgroundColor: color.tint }}><Icon name={icon} /></View>
    <View style={{ flex: 1, gap: 3 }}><Text style={[styles.body, { fontWeight: '600' }]}>{title}</Text><Text style={styles.caption}>{detail}</Text></View>
    <Icon name="chevron" size={16} tint={color.muted} />
  </Pressable>;
}
export function MoreScreen({ navigation }: FeatureNavigationProps) {
  const styles = useStyles();
  return <Page title="Your workspace"><ScopeLabel />
    <Card><Text style={styles.heading}>Everyday money</Text>
      <MenuRow title="Transactions and trash" detail="Review, edit and restore" icon="receipt" onPress={() => navigation.navigate('Transactions')} />
      <MenuRow title="Recent assistant conversations" detail="Your on-device conversations" icon="assistant" onPress={() => navigation.navigate('AssistantHistory')} />
      <MenuRow title="Financial accounts" detail="Banks, cards, cash and wallets" icon="account" onPress={() => navigation.navigate('Accounts')} />
      <MenuRow title="Categories" detail="Organize your spending" icon="category" onPress={() => navigation.navigate('Categories')} />
    </Card>
    <Card><Text style={styles.heading}>Looking ahead</Text>
      <MenuRow title="Goals and plans" detail="Make room for what matters" icon="goal" onPress={() => navigation.navigate('Goals')} />
      <MenuRow title="Recurring commitments" detail="Your regular expenses" icon="repeat" onPress={() => navigation.navigate('Commitments')} />
      <MenuRow title="Insights and reports" detail="Understand your money" icon="insights" onPress={() => navigation.navigate('Insights')} />
    </Card>
    <Card><Text style={styles.heading}>You and your household</Text>
      <MenuRow title="Households and invitations" detail="Manage your shared workspace" icon="people" onPress={() => navigation.navigate('Households')} />
      <MenuRow title="Settings and privacy" detail="Preferences and data controls" icon="settings" onPress={() => navigation.navigate('Settings')} />
    </Card>
    <Card><Text style={styles.heading}>Appearance</Text><AppearanceSwitch /></Card>
  </Page>;
}
const tabIcons: Record<string, IconName> = { Today: 'assistant', Overview: 'dashboard', Plan: 'goal', Insights: 'insights', More: 'more' };
export function NativeTabs({ navigation }: ScreenProps<'Home'>) {
  const { color } = useTheme();
  return <Tabs.Navigator screenOptions={({ route }) => ({ headerStyle: { backgroundColor: color.background }, headerTintColor: color.ink, headerShadowVisible: false,
    headerRight: () => <KeyboardDismissButton />, tabBarActiveTintColor: color.accent, tabBarInactiveTintColor: color.muted,
    tabBarStyle: { backgroundColor: color.surface, borderTopWidth: 0, boxShadow: `0 -4px 24px ${color.shadow}`, paddingTop: 8 },
    tabBarItemStyle: { borderRadius: 18, marginHorizontal: 3 }, tabBarActiveBackgroundColor: color.tint,
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 3 },
    tabBarIcon: ({ color: tint }) => <Icon name={tabIcons[route.name]!} tint={tint} size={23} /> })}>
    <Tabs.Screen name="Today" options={{ title: 'Assistant', headerShown: false, tabBarAccessibilityLabel: 'Today tab' }}>{() => <HomeScreen navigation={navigation} />}</Tabs.Screen>
    <Tabs.Screen name="Overview" options={{ title: 'Dashboard', tabBarAccessibilityLabel: 'Overview tab' }}>{() => <DashboardScreen navigation={navigation} />}</Tabs.Screen>
    <Tabs.Screen name="Plan" options={{ title: 'Planning', tabBarAccessibilityLabel: 'Plan tab' }}>{() => <GoalsScreen navigation={navigation} />}</Tabs.Screen>
    <Tabs.Screen name="Insights" component={InsightsScreen} options={{ title: 'Judgments', tabBarAccessibilityLabel: 'Insights tab' }} />
    <Tabs.Screen name="More" options={{ tabBarAccessibilityLabel: 'More tab' }}>{() => <MoreScreen navigation={navigation} />}</Tabs.Screen>
  </Tabs.Navigator>;
}
