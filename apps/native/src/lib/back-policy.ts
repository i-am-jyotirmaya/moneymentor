export function backAction(canGoBack: boolean, inWorkspace: boolean, pathname: string) {
  if (canGoBack) return 'pop';
  if (inWorkspace && pathname !== '/assistant') return 'assistant';
  if (!inWorkspace && pathname !== '/') return 'home';
  return 'exit';
}
