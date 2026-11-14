export type SectionStatus = 'loading' | 'ready' | 'empty' | 'error' | 'offline';
export type Failure = { kind: 'offline' | 'error'; message: string };
export function classifyFailure(error: unknown): Failure {
  const status = (error as { status?: number } | null)?.status;
  return { kind: status === undefined || status === 0 ? 'offline' : 'error',
    message: error instanceof Error ? error.message : 'The request could not be completed.' };
}
export function sectionStatus({ pending, hasData, empty, failure, offline }: { pending: boolean; hasData: boolean; empty: boolean; failure: Failure | null; offline: boolean }): SectionStatus {
  if (offline || failure?.kind === 'offline') return 'offline';
  if (failure) return 'error';
  if (!hasData && pending) return 'loading';
  return empty ? 'empty' : 'ready';
}
export function bannerPriority({ offline, error, readOnly, info }: { offline?: boolean; error?: boolean; readOnly?: boolean; info?: boolean }) {
  return offline ? 'offline' : error ? 'error' : readOnly ? 'readOnly' : info ? 'info' : null;
}
export const showNavLabels = (fontScale: number) => fontScale < 1.5;
