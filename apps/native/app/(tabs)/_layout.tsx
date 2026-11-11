import { Tabs } from "expo-router";

export const unstable_settings = { initialRouteName: "assistant" };

export default function TabsLayout() {
  return <Tabs>
    <Tabs.Screen name="assistant" options={{ title: "Assistant" }} />
    <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
    <Tabs.Screen name="transactions" options={{ title: "Transactions" }} />
    <Tabs.Screen name="settings" options={{ title: "Settings" }} />
  </Tabs>;
}
