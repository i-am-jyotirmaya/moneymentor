export function validateApiUrl(value, production) {
  if (!value && !production) return;
  if (!value) throw new Error("Set NEXT_PUBLIC_API_BASE_URL in apps/mobile/.env.local before building.");
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be an HTTP(S) API base URL without credentials, query or fragment.");
  }
  if (production && (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("Mobile builds require a device-reachable HTTPS API URL.");
  }
}
