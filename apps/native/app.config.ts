import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Spndrr Dev",
  slug: "spndrr",
  scheme: "spndrr",
  version: "0.1.0",
  android: { package: "com.spndrr.app.dev" },
  ios: { bundleIdentifier: "com.spndrr.app.dev" },
  plugins: ["expo-router", "expo-secure-store", "expo-dev-client"],
  extra: { apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL },
};
export default config;
