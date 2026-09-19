const routes = new Set(["/", "/login", "/signup", "/request-access", "/transactions", "/dashboard", "/assistant", "/reports", "/planning", "/household", "/settings", "/privacy"]);

// Return only a known local route, never an arbitrary URL or script.
export function mobileLinkTarget(value, webOrigin = "https://mvp.spndrr.com") {
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
