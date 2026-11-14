import { redirectIncomingPath } from '../src/lib/deep-links';

// Router calls this for initial and subsequent OS URLs before matching routes.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return redirectIncomingPath(path);
}
