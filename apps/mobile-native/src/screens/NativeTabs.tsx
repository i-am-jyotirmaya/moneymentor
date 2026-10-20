import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from './Home';
import { DashboardScreen } from './Dashboard';
import { GoalsScreen } from './Goals';
import { InsightsScreen } from './Insights';
import { Page } from '../ui/forms';
import { Button, Card, KeyboardDismissButton, styles } from '../ui/primitives';
import { color } from '../ui/theme';
import { ScopeLabel } from '../ui/workspace';
import type { FeatureNavigationProps, ScreenProps } from '../navigation';

const Tabs = createBottomTabNavigator<{ Today: undefined; Overview: undefined; Plan: undefined; Insights: undefined; More: undefined }>();
function MoreScreen({ navigation }: FeatureNavigationProps) {
  return <Page title="Your workspace"><ScopeLabel />
    <Card><Text style={styles.heading}>Everyday money</Text><Button title="Transactions and trash" secondary onPress={() => navigation.navigate('Transactions')} /><Button title="Transfers and adjustments" secondary onPress={() => navigation.navigate('FinancialEvent')} /><Button title="Financial accounts" secondary onPress={() => navigation.navigate('Accounts')} /><Button title="Categories" secondary onPress={() => navigation.navigate('Categories')} /></Card>
    <Card><Text style={styles.heading}>Looking ahead</Text><Button title="Goals and plans" secondary onPress={() => navigation.navigate('Goals')} /><Button title="Recurring commitments" secondary onPress={() => navigation.navigate('Commitments')} /><Button title="Insights and reports" secondary onPress={() => navigation.navigate('Insights')} /></Card>
    <Card><Text style={styles.heading}>You and your household</Text><Button title="Households and invitations" secondary onPress={() => navigation.navigate('Households')} /><Button title="Settings and privacy" secondary onPress={() => navigation.navigate('Settings')} /></Card>
  </Page>;
}
export function NativeTabs({ navigation }: ScreenProps<'Home'>) {
  return <Tabs.Navigator screenOptions={({ route }) => ({ headerStyle: { backgroundColor: color.background }, headerTintColor: color.ink, headerShadowVisible: false,
    headerRight: () => <KeyboardDismissButton />, tabBarActiveTintColor: color.ink, tabBarInactiveTintColor: color.muted,
    tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.border }, tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
    tabBarIcon: ({ color: tint }) => <Text accessible={false} style={{ color: tint, fontSize: 21 }}>{({ Today: '＋', Overview: '◉', Plan: '⚑', Insights: '✦', More: '•••' })[route.name]}</Text> })}>
    <Tabs.Screen name="Today" options={{ headerShown: false }}>{() => <HomeScreen navigation={navigation} />}</Tabs.Screen>
    <Tabs.Screen name="Overview">{() => <DashboardScreen navigation={navigation} />}</Tabs.Screen>
    <Tabs.Screen name="Plan">{() => <GoalsScreen navigation={navigation} />}</Tabs.Screen>
    <Tabs.Screen name="Insights" component={InsightsScreen} />
    <Tabs.Screen name="More">{() => <MoreScreen navigation={navigation} />}</Tabs.Screen>
  </Tabs.Navigator>;
}
