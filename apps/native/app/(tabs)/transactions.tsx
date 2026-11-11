import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { CategoryCatalog, Transaction, TransactionPage } from '../../src/api/models';
import { useSession } from '../../src/auth/session';
import { formatDate, formatMoney, formatMonthKey, formatTone, getCurrentMonthKey, getMonthOptions, shiftMonthKey } from '../../src/lib/format';
import { colors, styles } from '../../src/ui/theme';
import { useWorkspace } from '../../src/workspace/context';
import { transactionPresentation } from '../../src/workspace/dashboard-data';
import { Action, Choice, ErrorNotice, Loading, Panel, ws } from '../../src/workspace/ui';
import { buildTransactionPatch, toTransactionEditForm, validateTransactionEdit, type TransactionEditForm } from '../../src/workspace/transactions-data';
import { TransactionEditor } from '../../src/workspace/transaction-editor';

// Remount scoped state immediately when the workspace or signed-in user changes.
export default function Transactions() {
  const workspace = useWorkspace();
  const { session } = useSession();
  return <TransactionScreen key={`${session?.user.id}:${workspace.householdId}`} />;
}
function TransactionScreen() {
  const { client } = useSession();
  const workspace = useWorkspace();
  const scope = workspace.householdId;
  const canWrite = workspace.households?.households.find(h => h.id === scope)?.canWrite === true;
  const [month, setMonth] = useState(getCurrentMonthKey);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; page: TransactionPage; trash: Transaction[]; catalog: CategoryCatalog } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ transaction: Transaction; form: TransactionEditForm } | null>(null);
  const [undo, setUndo] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const key = `${month}:${page}:${workspace.dataRevision}`;
  useEffect(() => {
    let current = true;
    if (!scope) return;
    void Promise.all([client.transactions(month, page, scope), client.listDeletedTransactions(scope), client.categories(scope)])
      .then(([data, trash, catalog]) => { if (current) setResult({ key, page: data, trash: trash.items, catalog }); })
      .catch(e => { if (current) setError(e instanceof Error ? e.message : 'Could not load your workspace.'); });
    return () => { current = false; };
  }, [client, scope, month, page, key, attempt]);
  const data = result?.key === key ? result : null;
  const loading = !data && !error;
  const refresh = () => { setError(null); setAttempt(n => n + 1); workspace.retry(); };
  async function mutate(t: Transaction, action: 'delete' | 'restore' | 'save') {
    if (!canWrite || lock.current || t.householdId !== scope) return;
    if (action === 'save' && editor) {
      const validation = validateTransactionEdit(editor.form);
      if (validation) { setError(validation); return; }
    }
    lock.current = true; setBusy(true); setError(null);
    try {
      const updated = action === 'delete' ? await client.deleteTransaction(t.id) : action === 'restore' ? await client.restoreTransaction(t.id) : await client.updateTransaction(t.id, buildTransactionPatch(t, editor!.form));
      if (!alive.current) return;
      setResult(current => current ? {
        ...current,
        page: { ...current.page, items: action === 'delete' ? current.page.items.filter(item => item.id !== t.id)
          : action === 'save' ? current.page.items.map(item => item.id === updated.id ? updated : item)
          : [updated, ...current.page.items.filter(item => item.id !== updated.id)] },
        trash: action === 'delete' ? [updated, ...current.trash.filter(item => item.id !== updated.id)]
          : action === 'restore' ? current.trash.filter(item => item.id !== updated.id) : current.trash,
      } : current);
      if (action === 'delete') setUndo(updated);
      if (action === 'restore') setUndo(value => value?.id === t.id ? null : value);
      if (action === 'save') setEditor(null);
      refresh();
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : action === 'save' ? 'Could not update the transaction.' : action === 'delete' ? 'Could not move the transaction to trash.' : 'Could not restore the transaction.');
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function changeMonth(value: string) { setError(null); setMonth(value); setPage(1); setEditor(null); }
  const totalPages = Math.max(data?.page.totalPages ?? 0, 1);
  return <View testID="transactions-screen" style={ws.fill}><ScrollView contentContainerStyle={ws.content} accessibilityState={{ busy: loading }}>
    <Panel title="Transactions"><Text style={styles.text}>Review one month at a time and edit a record when you need to.</Text>
      <View style={ws.row}><Action title="‹" label="Previous transaction month" disabled={loading || busy} onPress={() => changeMonth(shiftMonthKey(month, -1))} /><Choice label="Transaction month" value={month} disabled={loading || busy} options={getMonthOptions(month).map(value => ({ value, label: formatMonthKey(value) }))} onChange={changeMonth} /><Action title="›" label="Next transaction month" disabled={loading || busy || shiftMonthKey(month, 1) > getCurrentMonthKey()} onPress={() => changeMonth(shiftMonthKey(month, 1))} /></View>
      <ErrorNotice error={error} retry={() => { setError(null); setAttempt(n => n + 1); }} />
      {loading ? <Loading label="Loading transactions" /> : data ? data.page.items.length ? data.page.items.map(t => {
        const display = transactionPresentation(t);
        return <View key={t.id} testID={`transaction-row-${t.id}`} style={{ paddingVertical: 16, gap: 8, borderBottomWidth: 1, borderColor: colors.border }}><View style={ws.row}><Text style={styles.label}>{display.label}</Text><Text style={ws.small}>{formatTone(t.kind ?? t.type)}</Text></View><Text style={ws.small}>{t.categoryName ?? 'Uncategorized'}{display.income && t.senderName ? ` - From ${t.senderName}` : ''}{!display.income && t.merchantName ? ` - ${t.merchantName}` : ''} - {formatDate(t.transactionDate)}{t.accountName ? ` · ${t.accountName}` : ''}{t.counterpartyAccountName ? ` → ${t.counterpartyAccountName}` : ''}{t.relatedTransactionId ? ' · Linked adjustment' : ''}</Text><View style={ws.row}><Text style={[styles.label, display.income && { color: '#047857' }]}>{display.sign}{formatMoney(t.amount, t.currencyCode)}</Text><Action title="Edit" label={`Edit transaction ${display.label}`} disabled={!canWrite || busy} onPress={() => { setError(null); setEditor({ transaction: t, form: toTransactionEditForm(t) }); }} /><Action title="Delete" label={`Delete transaction ${display.label}`} disabled={!canWrite || busy} onPress={() => void mutate(t, 'delete')} /></View></View>;
      }) : <Text style={styles.text}>No transactions found in {formatMonthKey(month)}.</Text> : null}
      <Text accessibilityLiveRegion="polite" style={styles.text}>{data?.page.totalCount ?? 0} records, Page {data?.page.page ?? 1} of {totalPages}</Text><View style={ws.row}><Action title="Previous" label="Previous transaction page" disabled={loading || busy || page <= 1} onPress={() => { setError(null); setPage(page - 1); setEditor(null); }} /><Action title="Next" label="Next transaction page" disabled={loading || busy || page >= totalPages} onPress={() => { setError(null); setPage(page + 1); setEditor(null); }} /></View>
    </Panel>
    <Panel title="Recently deleted"><Text style={styles.text}>Items remain restorable for 30 days.</Text>{data?.trash.length ? data.trash.map(t => <View key={t.id} style={ws.row}><View style={{ flex: 1 }}><Text style={styles.label}>{t.reason ?? t.description ?? t.categoryName ?? 'Transaction'}</Text><Text style={ws.small}>{formatMoney(t.amount, t.currencyCode)} · purge {t.purgeAfter ? formatDate(t.purgeAfter) : 'in 30 days'}</Text></View><Action title="Restore" disabled={!canWrite || busy} onPress={() => void mutate(t, 'restore')} /></View>) : <Text style={styles.text}>Trash is empty.</Text>}</Panel>
  </ScrollView>{undo ? <View style={ws.card} accessibilityLiveRegion="polite"><Text style={styles.label}>Moved to Recently Deleted.</Text><View style={ws.row}><Action title="Undo" disabled={!canWrite || busy} onPress={() => void mutate(undo, 'restore')} /><Action title="×" label="Dismiss undo" onPress={() => setUndo(null)} /></View></View> : null}
    {editor && canWrite ? <TransactionEditor transaction={editor.transaction} catalog={data?.catalog ?? null} form={editor.form} setForm={form => setEditor({ ...editor, form })} saving={busy} error={error} close={() => setEditor(null)} save={() => void mutate(editor.transaction, 'save')} /> : null}
  </View>;
}
