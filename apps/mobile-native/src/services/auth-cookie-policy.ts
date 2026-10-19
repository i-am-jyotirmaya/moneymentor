type NativeCookie = { value?: string; expires?: string };
export const authCookieNames = ['mm_refresh', 'mm_session'] as const;
/** Public access/registration endpoints neither need nor issue session cookies. */
export function usesAuthCookies(path: string, method: string) {
  return method === 'POST' && ['/api/auth/login', '/api/auth/users', '/api/auth/refresh', '/api/auth/logout'].includes(path);
}
/** Android returns cookie values without attribute metadata. Restore the known API policy. */
export function authCookieSnapshot(jar: Record<string, NativeCookie>, hostname: string) {
  return authCookieNames.flatMap(name => jar[name]?.value ? [{
    name, value: jar[name]!.value!, domain: hostname, path: '/api/auth', secure: true, httpOnly: true,
    ...(jar[name]?.expires ? { expires: jar[name]!.expires } : {}),
  }] : []);
}
