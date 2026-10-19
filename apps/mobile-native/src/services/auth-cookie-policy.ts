type NativeCookie = { value?: string; expires?: string };
export const authCookieNames = ['mm_refresh', 'mm_session'] as const;
/** Android returns cookie values without attribute metadata. Restore the known API policy. */
export function authCookieSnapshot(jar: Record<string, NativeCookie>, hostname: string, ios: boolean) {
  return authCookieNames.flatMap(name => jar[name]?.value ? [{
    name, value: jar[name]!.value!, domain: hostname, path: '/api/auth', secure: true, httpOnly: true,
    ...(ios && jar[name]?.expires ? { expires: jar[name]!.expires } : {}),
  }] : []);
}
