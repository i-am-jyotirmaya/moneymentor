import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { getAccessToken } from "../src/auth/token-storage";

export default function Index() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    getAccessToken().then(token => { if (active) setSignedIn(Boolean(token)); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  if (error) return <View><Text>Unable to read your secure session. Please restart Spndrr.</Text></View>;
  if (signedIn === null) return <ActivityIndicator accessibilityLabel="Loading session" />;
  return <Redirect href={signedIn ? "/(tabs)/assistant" : "/(auth)/login"} />;
}
