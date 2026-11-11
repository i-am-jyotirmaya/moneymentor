import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useSession } from "../../src/auth/session";
import { Button } from "../../src/ui/AuthForm";
import { styles } from "../../src/ui/theme";

export default function Settings() {
  const { client, session } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <View style={styles.page}><View style={styles.card}>
    <Text style={styles.title}>Settings</Text>
    <Text style={styles.text}>{session?.user.displayName}</Text>
    <Text style={styles.text}>{session?.user.email}</Text>
    <Button title="Sign out" disabled={busy} onPress={() => {
      setBusy(true);
      void client.logout().catch(() => undefined).finally(() => { router.replace("/(auth)/login"); setBusy(false); });
    }} />
  </View></View>;
}
