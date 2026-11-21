import { Redirect, useRouter } from "expo-router";
import { useDeviceLock } from "../src/auth/device-lock";
import { useSession } from "../src/auth/session";
import { AuthWelcome } from "../src/ui/AuthWelcome";
import { useRegistrationDestination } from "../src/ui/AuthForm";

export default function Index() {
  const { status } = useSession();
  const deviceLock = useDeviceLock();
  if (deviceLock !== "open") return null;
  if (status === "authenticated") return <Redirect href="/(tabs)/assistant" />;
  return <Welcome />;
}

function Welcome() {
  const router = useRouter();
  const { open, href } = useRegistrationDestination();
  return <AuthWelcome testID="home-screen" signInTestID="home-login-button" open={open}
    onRegister={() => router.push(href)} onSignIn={() => router.push("/(auth)/login")} />;
}
