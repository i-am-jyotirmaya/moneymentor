import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Alert, Text } from 'react-native';
import { WriteGuard } from '../services/write-guard';
import type { SecureJsonStore } from '../services/secure-json';
import { Button, Card, ErrorNotice, styles } from '../ui/primitives';

const OperationsContext = createContext<WriteGuard | null>(null);
export function OperationsProvider({ ownerId, vault, children }: { ownerId: string; vault: SecureJsonStore; children: ReactNode }) {
  const [guard] = useState(() => new WriteGuard(vault, ownerId));
  useEffect(() => { void guard.restore(); }, [guard]);
  return <OperationsContext.Provider value={guard}>{children}</OperationsContext.Provider>;
}
export function useOperations() {
  const guard = useContext(OperationsContext); if (!guard) throw Error('Missing financial operations provider.');
  const state = useSyncExternalStore(guard.subscribe, guard.getSnapshot);
  return { guard, ...state, blocked: !state.ready || state.busy || state.pending !== null };
}
export function OperationNotice({ refresh }: { refresh: () => Promise<unknown> }) {
  const operations = useOperations(); const [error, setError] = useState<string | null>(null); const [reviewedFor, setReviewedFor] = useState<string | null>(null);
  if (!operations.ready) return operations.error ? <ErrorNotice message={operations.error} onRetry={() => { void operations.guard.restore(); }} /> : null;
  if (!operations.pending) return null;
  const acknowledge = () => Alert.alert('Finished reviewing?', 'Confirm that you checked the saved data. The earlier change may already be saved.', [
    { text: 'Keep reviewing', style: 'cancel' },
    { text: 'I checked the saved data', onPress: () => { void operations.guard.acknowledgeReview().catch(() => setError('The pending change could not be cleared. Try again.')); } },
  ]);
  return <Card><Text accessibilityRole="header" style={styles.heading}>Review your earlier change</Text>
    <Text style={styles.body}>{operations.pending.label} may already be saved. Refresh and review the saved data before making another change.</Text>
    <Button title="Refresh saved data" secondary disabled={operations.busy} onPress={() => { setError(null); const startedAt = operations.pending!.startedAt; void refresh().then(() => setReviewedFor(startedAt)).catch(() => setError('Saved data could not be refreshed yet.')); }} />
    {reviewedFor === operations.pending.startedAt ? <Button title="I have reviewed the saved data" secondary onPress={acknowledge} /> : null}
    {error || operations.error ? <ErrorNotice message={error ?? operations.error!} /> : null}
  </Card>;
}
