export const deviceUnlockPreferenceKey = "spndrr.device-unlock";

export type DeviceUnlockPreference = "off" | "screen-lock" | "biometrics";
export type DeviceCredentialStatus = "success" | "cancelled" | "unavailable" | "failed";

export function readDeviceUnlockPreference(value: string | null): DeviceUnlockPreference | null {
  return value === "off" || value === "screen-lock" || value === "biometrics" ? value : null;
}

export function hasDeviceUnlock(preference: DeviceUnlockPreference | null): preference is "screen-lock" | "biometrics" {
  return preference === "screen-lock" || preference === "biometrics";
}
