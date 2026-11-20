import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.spndrr.app",
  appName: "Spndrr",
  webDir: "out",
  backgroundColor: "#F3F5F9",
  server: { androidScheme: "https" },
  plugins: {
    // Keep the existing HttpOnly refresh-cookie contract using native networking.
    // Do not expose cookies through the JavaScript cookie API.
    CapacitorHttp: { enabled: true },
    CapacitorPasskey: {
      domains: [process.env.NEXT_PUBLIC_PASSKEY_RP_ID ?? new URL(process.env.NEXT_PUBLIC_WEB_APP_URL ?? "https://mvp.spndrr.com").hostname],
    },
    Keyboard: { resize: "native", resizeOnFullScreen: true },
  },
};

export default config;
