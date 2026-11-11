import Constants from "expo-constants";

export function validateApiBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Set EXPO_PUBLIC_API_BASE_URL in apps/native/.env before starting Spndrr.");
  }
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("Invalid API URL");
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be an HTTP(S) URL without credentials, query or fragment.");
  }
}

export function getApiBaseUrl(): string {
  return validateApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? Constants.expoConfig?.extra?.apiBaseUrl);
}
