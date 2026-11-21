import { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import type { PasskeySummary } from "../api/client";
import { Button, ErrorBox, Field } from "../ui/AuthForm";
import { Text } from "../ui";
import { Panel } from "../workspace/ui";
import { getPasskeyCredential } from "./passkeys";
import { useSession } from "./session";

export function PasskeySettings() {
  const { client } = useSession();
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const flight = useRef(false);

  async function update(operation?: "create" | string) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      if (operation === "create") {
        const created = await client.registerPasskey(password, options => getPasskeyCredential("create", options));
        if (!created) return;
        setNotice("Passkey added.");
      } else if (operation) {
        await client.removePasskey(operation, password);
        setNotice("Passkey removed.");
      }
      setPasskeys(await client.listPasskeys());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your passkeys.");
    } finally {
      if (operation) setPassword("");
      setBusy(false);
      flight.current = false;
    }
  }

  useEffect(() => {
    let active = true;
    void client.listPasskeys().then(result => { if (active) setPasskeys(result); }).catch(() => {
      if (active) setError("Could not load your passkeys.");
    });
    return () => { active = false; };
  }, [client]);

  return <Panel title="Passkeys">
    <Text tone="text2">Use a passkey for passwordless sign-in. Confirm your password to add or remove one.</Text>
    <Field label="Current password for passkeys" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" />
    <Button title="Add a passkey" testID="add-passkey" disabled={busy || !password} onPress={() => void update("create")} />
    <ErrorBox message={error} />
    {notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
    {passkeys === null && error && <Button title="Retry loading passkeys" variant="outline" disabled={busy} onPress={() => void update()} />}
    {passkeys?.map(passkey => {
      const label = `Added ${new Date(passkey.createdAt).toLocaleString()}`;
      return <View key={passkey.id} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1 }}>{label}</Text>
        <Button title="Remove" variant="outline" fullWidth={false} disabled={busy || !password} onPress={() => {
          Alert.alert("Remove this passkey?", label, [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: () => void update(passkey.id) },
          ]);
        }} />
      </View>;
    })}
  </Panel>;
}
