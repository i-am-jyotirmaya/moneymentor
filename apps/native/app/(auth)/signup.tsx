import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { ApiError } from "../../src/api/client";
import { registrationIsOpen } from "../../src/auth/registration";
import { useSession } from "../../src/auth/session";
import { AuthFrame } from "../../src/ui/AuthFrame";
import { AuthPrimary } from "../../src/ui/AuthVisuals";
import { AuthForm, AuthLink, ErrorBox, type Invitation } from "../../src/ui/AuthForm";
import { Skeleton } from "../../src/ui/Skeleton";

export default function Signup() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  return <SignupGate key={token ?? "open"} token={token} />;
}

function SignupGate({ token }: { token?: string }) {
  const { client } = useSession();
  const router = useRouter();
  const [state, setState] = useState<{ token?: string; invitation?: Invitation } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!token) {
        const open = await registrationIsOpen(client);
        if (!active) return;
        if (open) setState({}); else router.replace("/(auth)/request-access");
        return;
      }
      try {
        const invitation = await client.validateInvitation(token);
        if (active) setState({ token, invitation: { ...invitation, token } });
      } catch (caught) {
        if (active) setError(caught instanceof ApiError && caught.status === 403
          ? "This signup link is invalid, expired, or already used. Contact support for a replacement link."
          : "We couldn’t verify your signup link. Please reload to try again or contact support.");
      }
    })();
    return () => { active = false; };
  }, [client, router, token, attempt]);
  if (state && state.token === token) return <AuthForm key={token ?? "open"} mode="signup" invitation={state.invitation} />;
  return <AuthFrame title={error ? "Signup link\nunavailable." : "Create your\naccount."}>
    {error ? (
      <>
        <ErrorBox message={error} />
        <AuthPrimary label="Try again" onPress={() => { setError(""); setAttempt(n => n + 1); }} />
        <AuthLink title="Contact support" onPress={() => { void Linking.openURL(`mailto:${process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "support@spndrr.example"}`); }} />
        <AuthLink title="Sign in to an existing account" onPress={() => router.navigate("/(auth)/login")} />
        <AuthLink title="Request MVP access" onPress={() => router.navigate("/(auth)/request-access")} />
      </>
    ) : <Skeleton label="Loading signup" />}
  </AuthFrame>;
}
