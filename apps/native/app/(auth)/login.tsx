import { Link } from "expo-router";
import { View } from "react-native";
import { Placeholder } from "../../src/components/placeholder";

export default function Login() {
  return <View style={{ flex: 1 }}><Placeholder title="Sign in to Spndrr" /><Link href="/(tabs)/assistant" style={{ padding: 24 }}>Preview placeholder tabs</Link></View>;
}
