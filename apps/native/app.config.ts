import type { ExpoConfig } from "expo/config";

const origin = new URL(process.env.EXPO_PUBLIC_WEB_APP_URL ?? "https://mvp.spndrr.com");

const config: ExpoConfig = {
  name: "Spndrr Dev",
  slug: "spndrr",
  scheme: "spndrr",
  version: "0.1.0",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  androidStatusBar: { backgroundColor: "#F4F6FB", barStyle: "dark-content" },
  backgroundColor: "#F4F6FB",
  android: {
    package: "com.spndrr.app.dev",
    softwareKeyboardLayoutMode: "resize",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", monochromeImage: "./assets/adaptive-icon-monochrome.png", backgroundColor: "#0E1433" },
    // Exact path matches deliberately leave all other web pages in the browser.
    intentFilters: [{ action: "VIEW", autoVerify: true, category: ["BROWSABLE", "DEFAULT"], data: [
      { scheme: "https", host: origin.hostname, path: "/signup" },
      { scheme: "https", host: origin.hostname, path: "/signup/" },
    ] }],
  },
  ios: { bundleIdentifier: "com.spndrr.app.dev", associatedDomains: [`applinks:${origin.hostname}`], infoPlist: {
    NSSpeechRecognitionUsageDescription: "Spndrr converts spoken finance messages to text.",
  } },
  // Run our native overrides after the standard plugins configure the activity.
  plugins: [
    "expo-router", "expo-secure-store", "expo-dev-client",
    ["expo-audio", { microphonePermission: "Spndrr uses your microphone to capture spoken finance messages.", recordAudioAndroid: true, enableBackgroundPlayback: false }],
    ["expo-splash-screen", { backgroundColor: "#F4F6FB", image: "./assets/splash.png", imageWidth: 200, dark: { backgroundColor: "#0A0D18", image: "./assets/splash-dark.png" } }],
    "./plugins/with-platform",
  ],
  extra: { apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL },
};
export default config;
