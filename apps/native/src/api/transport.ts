import { getAccessToken } from "../auth/token-storage";
import { getApiBaseUrl, validateApiBaseUrl } from "../config";
import type { Transport } from "./client";

export function createTransport(baseUrl = getApiBaseUrl()): Transport {
  const base = validateApiBaseUrl(baseUrl);
  return async ({ path, method, body, headers: requestHeaders }) => {
    if (!path.startsWith("/api/") || path.includes("://") || path.includes("..")) {
      throw new Error("Invalid API path.");
    }
    const headers = new Headers(requestHeaders);
    headers.set("Accept", "application/json");
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (!headers.has("Authorization")) {
      const token = await getAccessToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await fetch(`${base}${path}`, {
      method, headers, credentials: "include",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch { data = null; }
    }
    return { status: response.status, data };
  };
}
