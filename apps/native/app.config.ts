import type { ExpoConfig } from "expo/config";

const origin = new URL(process.env.EXPO_PUBLIC_WEB_APP_URL ?? "https://mvp.spndrr.com");

const config: ExpoConfig = {
  name: "Spndrr Dev",
  slug: "spndrr",
  scheme: "spndrr",
  version: "0.1.0",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  android: {
    package: "com.spndrr.app.dev",
    softwareKeyboardLayoutMode: "resize",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#F3F5F9" },
    intentFilters: [{ action: "VIEW", autoVerify: true, category: ["BROWSABLE", "DEFAULT"], data: [{ scheme: "https", host: origin.hostname }] }],
  },
  ios: { bundleIdentifier: "com.spndrr.app.dev", associatedDomains: [`applinks:${origin.hostname}`] },
  plugins: ["expo-router", "expo-secure-store", "expo-dev-client", "./plugins/with-platform", ["expo-splash-screen", { backgroundColor: "#F3F5F9", image: "./assets/splash.png", imageWidth: 280, android: { image: "./assets/adaptive-icon.png", imageWidth: 200 } }]],
  extra: { apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL },
};
export default config;
