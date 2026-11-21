import { requireOptionalNativeModule } from "expo";
import type { LocalAuthenticationResult } from "expo-local-authentication";
import type { DeviceCredentialStatus } from "../../../shared/device-unlock";

const credential = requireOptionalNativeModule<{ authenticate(): Promise<DeviceCredentialStatus> }>("SpndrrDeviceCredential");

export async function authenticateWithScreenLock(): Promise<LocalAuthenticationResult> {
  const status = await credential?.authenticate();
  if (status === "success") return { success: true };
  if (status === "cancelled") return { success: false, error: "user_cancel" };
  if (status === "unavailable") return { success: false, error: "passcode_not_set" };
  return { success: false, error: "authentication_failed" };
}
