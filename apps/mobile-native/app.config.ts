import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT ?? "development";
  const fixture = process.env.EXPO_PUBLIC_E2E === "1";
  if (fixture && variant !== "e2e") throw new Error("Fixture transport is restricted to the e2e app variant.");
  const identifier = variant === "production" ? "com.spndrr.app" : variant === "e2e" ? "com.spndrr.app.rn.e2e" : "com.spndrr.app.rn";
  return {
    ...config, name: variant === "production" ? "Spndrr" : fixture ? "Spndrr QA" : "Spndrr Native",
    slug: "spndrr-native", version: "0.1.0", orientation: "default", scheme: "spndrr-native",
    userInterfaceStyle: "automatic", icon: "./assets/icon.png",
    owner: process.env.EXPO_OWNER || undefined,
    ios: { bundleIdentifier: identifier, supportsTablet: true, config: { usesNonExemptEncryption: false } },
    android: { package: identifier, softwareKeyboardLayoutMode: "resize", adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#102b26" } },
    plugins: [["expo-secure-store", { configureAndroidBackup: true }], ["expo-speech-recognition", {
      microphonePermission: "Allow Spndrr to turn speech into text you can review before sending.",
      speechRecognitionPermission: "Allow Spndrr to use speech recognition for your dictated text.",
    }]],
    extra: { fixture, appVariant: variant, ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}) },
    // OTA publishing is intentionally not configured until runtime/signing acceptance.
  };
};
