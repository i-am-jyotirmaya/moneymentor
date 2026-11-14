const routes = new Set(["/", "/login", "/signup", "/request-access", "/transactions", "/dashboard", "/assistant", "/reports", "/planning", "/household", "/settings", "/privacy"]);

// Return only a known local route, never an arbitrary URL or script.
export function mobileLinkTarget(value: string, webOrigin = process.env.EXPO_PUBLIC_WEB_APP_URL ?? "https://mvp.spndrr.com") {
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    let pathname;
    if (url.protocol === "spndrr:") {
      pathname = url.hostname ? `/${url.hostname}${url.pathname}` : url.pathname;
    } else if (url.protocol === "https:" && url.origin === new URL(webOrigin).origin) {
      pathname = url.pathname;
    } else return null;
    pathname = pathname.replace(/\/+$/, "") || "/";
    if (!routes.has(pathname)) return null;
    // Invitations use a fragment so the token does not enter server logs.
    const token = pathname === "/signup" ? new URLSearchParams(url.hash.slice(1)).get("token") : null;
    return `${pathname === "/" ? "/" : `${pathname}/`}${token ? `#token=${encodeURIComponent(token)}` : ""}`;
  } catch {
    return null;
  }
}

export function invitationToken(value: string): string | null {
  const target = mobileLinkTarget(value.trim());
  if (!target?.startsWith("/signup/#token=")) return null;
  return new URLSearchParams(target.split("#")[1]).get("token") || null;
}

// OS entry only: query tokens remain supported for existing scheme links.
export function incomingLinkTarget(value: string, webOrigin?: string): string | null {
  const safe = mobileLinkTarget(value, webOrigin);
  if (!safe) return null;
  const path = safe.split('#')[0].replace(/\/$/, '') || '/';
  if (path === '/signup') {
    const url = new URL(value);
    const token = new URLSearchParams(url.hash.slice(1)).get('token') || url.searchParams.get('token');
    if (token) return `/(auth)/signup?token=${encodeURIComponent(token)}`;
  }
  if (['/login', '/signup', '/request-access'].includes(path)) return `/(auth)${path}`;
  if (path === '/privacy') return null; // Policy is an in-app sheet, not a route.
  return path === '/' ? '/' : `/(tabs)${path}`;
}

// Leave unrecognized URLs (Expo dev-client, unknown schemes) unchanged.
export function redirectIncomingPath(path: string, webOrigin?: string) {
  return incomingLinkTarget(path, webOrigin) ?? path;
}
