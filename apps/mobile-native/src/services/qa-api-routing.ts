/** QA binary only. No arbitrary server selection, HTTP exception or TLS bypass. */
type QaLink = { protocol: string; hostname: string; searchParams: { get: (name: string) => string | null } };
export function qaApiRoute(link: QaLink | null, restored: unknown): string | null {
  const validate = (origin: unknown) => {
    if (origin !== 'https://localhost:7443') throw Error('The QA API must be the isolated HTTPS loopback server.');
    return origin;
  };
  if (link) {
    if (link.protocol === 'spndrr-native:' && link.hostname === 'qa') {
      if (link.searchParams.get('fixture') === '1') return null;
      return validate(link.searchParams.get('api'));
    }
  }
  if (restored === null) return null;
  if (!restored || typeof restored !== 'object' || !('origin' in restored)) throw Error('The QA API selection could not be restored.');
  return validate(restored.origin);
}
