import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.spndrr.app",
  appName: "Spndrr",
  webDir: "out",
  backgroundColor: "#f4f7f6",
  server: { androidScheme: "https" },
  plugins: {
    // Keep the existing HttpOnly refresh-cookie contract using native networking.
    // Do not expose cookies through the JavaScript cookie API.
    CapacitorHttp: { enabled: true },
    Keyboard: { resize: "native", resizeOnFullScreen: true },
  },
};

export default config;
