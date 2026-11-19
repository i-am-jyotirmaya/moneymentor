import { useSectionLoad, SectionPanel } from '../../src/workspace/sections';
import { useOffline } from '../../src/workspace/connection';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Transaction } from '../../src/api/models';
import { useSession } from '../../src/auth/session';
import { formatDate, formatMoney, formatMonthKey, getCurrentMonthKey, getMonthOptions, shiftMonthKey } from '../../src/lib/format';
import { Money } from '../../src/ui/Money';
import { Card, EmptyState, FilterChips, Icon, PressableScale, TxRow, useThemedStyles, type IconName } from '../../src/ui/stubs';
import { useTheme, type ThemeValue } from '../../src/ui/ThemeProvider';
import { useDockSpace } from '../../src/workspace/dock';
import { fetchMonthly } from '../../src/workspace/monthly-trend';
import { useWorkspace } from '../../src/workspace/context';
import { Action, Choice, ErrorNotice, Loading } from '../../src/workspace/ui';
import { buildTransactionPatch, filterCounts, groupByDay, matchesFilter, toTransactionEditForm, validateTransactionEdit, type TransactionEditForm, type TxFilter } from '../../src/workspace/transactions-data';
import { TransactionEditor } from '../../src/workspace/transaction-editor';

// Remount scoped state immediately when the workspace or signed-in user changes.
export default function Transactions() {
  const workspace = useWorkspace();
  const { session } = useSession();
  return <TransactionScreen key={`${session?.user.id}:${workspace.householdId}`} />;
}
function TransactionScreen() {
  const { client } = useSession();
  const offline = useOffline();
  const workspace = useWorkspace();
  const scope = workspace.householdId;
  const canWrite = workspace.households?.households.find(h => h.id === scope)?.canWrite === true;
  const [month, setMonth] = useState(getCurrentMonthKey);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ transaction: Transaction; form: TransactionEditForm } | null>(null);
  const [undo, setUndo] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<TxFilter>('all');
  const [monthMenu, setMonthMenu] = useState(false);
  const [totalsState, setTotals] = useState<{ key: string; value: { income: number; spends: number } | null } | null>(null);
  const router = useRouter();
  const theme = useTheme();
  const s = useThemedStyles(makeStyles);
  const dock = useDockSpace();
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const section = useSectionLoad('transactions', JSON.stringify(['transactions', scope, month, page]), async () => {
    const [data, trash, catalog] = await Promise.all([client.transactions(month, page, scope!), client.listDeletedTransactions(scope!), client.categories(scope!)]);
    return { page: data, trash: trash.items, catalog };
  }, data => data.page.items.length === 0 && data.trash.length === 0, !!scope);
  const data = section.data;
  const revision = workspace.dataRevision;
  const totalsKey = `${scope}:${month}:${revision}`;
  const totals = totalsState?.key === totalsKey ? totalsState.value : null;
  useEffect(() => {
    let current = true;
    // Month totals come from the cached monthly dashboard (shared with the dashboard trend), not the paged list.
    void fetchMonthly(client, scope, month, revision > 0 && month === getCurrentMonthKey()).then(result => { if (current) setTotals({ key: totalsKey, value: result ? { income: result.income, spends: result.spends } : null }); });
    return () => { current = false; };
  }, [client, scope, month, revision, totalsKey]);
  const setResult = section.setData;
  const loading = section.loading;
  const refresh = () => { setError(null); section.retry(); workspace.retry(); };
  async function mutate(t: Transaction, action: 'delete' | 'restore' | 'save') {
    if (offline || !canWrite || lock.current || t.householdId !== scope) return;
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
  function changeMonth(value: string) { setError(null); setMonth(value); setPage(1); setEditor(null); setFilter('all'); }
  if (section.blocked || section.loading) return <SectionPanel section={section} />;
  const totalPages = Math.max(data?.page.totalPages ?? 0, 1);
  const items = data?.page.items ?? [];
  const counts = filterCounts(items);
  const groups = groupByDay(items.filter(t => matchesFilter(t, filter)), localDayKey());
  const atCurrent = shiftMonthKey(month, 1) > getCurrentMonthKey();
  const openEditor = (t: Transaction) => { if (!canWrite || busy) return; setError(null); setEditor({ transaction: t, form: toTransactionEditForm(t) }); };
  return <View testID="transactions-screen" style={s.fill}><ScrollView contentContainerStyle={[s.content, { paddingBottom: dock + 88 }]} accessibilityState={{ busy: loading }}>
    <View style={s.stepper}>
      <IconStep icon={{ android: 'chevron_left', ios: 'chevron.left' }} label="Previous transaction month" disabled={loading || busy} onPress={() => changeMonth(shiftMonthKey(month, -1))} />
      <Pressable testID="transactions-month" accessibilityRole="button" accessibilityLabel={`Transaction month, ${formatMonthKey(month)}`} accessibilityHint="Choose a month" disabled={loading || busy} onPress={() => setMonthMenu(true)} style={s.monthButton}>
        <Text style={s.month}>{formatMonthKey(month)}</Text><Icon name={{ android: 'expand_more', ios: 'chevron.down' }} size={20} color={theme.color.text2} />
      </Pressable>
      <IconStep icon={{ android: 'chevron_right', ios: 'chevron.right' }} label="Next transaction month" disabled={loading || busy || atCurrent} onPress={() => changeMonth(shiftMonthKey(month, 1))} />
    </View>
    <View style={s.tiles}>
      <Card padding={16} style={s.tile}><View style={s.tileHead}><Icon name={{ android: 'south_west', ios: 'arrow.down.left' }} size={18} color={theme.color.text2} /><Text style={s.tileLabel}>Money in</Text></View>
        {totals ? <Money value={totals.income} sign="always" variant="title" tone="income" /> : <Text style={s.tileLabel}>—</Text>}</Card>
      <Card padding={16} style={s.tile}><View style={s.tileHead}><Icon name={{ android: 'north_east', ios: 'arrow.up.right' }} size={18} color={theme.color.text2} /><Text style={s.tileLabel}>Money out</Text></View>
        {totals ? <Money value={-totals.spends} variant="title" /> : <Text style={s.tileLabel}>—</Text>}</Card>
    </View>
    <FilterChips testID="transactions-filter" value={filter} onChange={setFilter} options={[
      { key: 'all', label: 'All', count: counts.all }, { key: 'expenses', label: 'Expenses', count: counts.expenses },
      { key: 'income', label: 'Income', count: counts.income }, { key: 'transfers', label: 'Transfers', count: counts.transfers }]} />
    <ErrorNotice error={error} retry={() => { setError(null); section.retry(); }} />
    {loading ? <Loading label="Loading transactions" /> : groups.length ? groups.map(group => <View key={group.key} style={s.group}>
      <View style={s.dayHead} accessibilityRole="header"><Text style={s.dayLabel}>{group.label}</Text><Money value={group.total} sign="always" variant="caption" tone="text2" /></View>
      {group.items.map(t => <TxRow key={t.id} tx={t} testID={`transaction-row-${t.id}`} onPress={canWrite ? () => openEditor(t) : undefined} />)}
    </View>) : <EmptyState icon={{ android: 'receipt_long', ios: 'list.bullet.rectangle' }} title={filter === 'all' ? 'No transactions yet' : 'Nothing in this filter'} body={filter === 'all' ? `Nothing logged in ${formatMonthKey(month)}.` : 'Try another filter or month.'} />}
    {totalPages > 1 ? <View style={s.pager}>
      <Action title="Previous" label="Previous transaction page" disabled={loading || busy || page <= 1} onPress={() => { setError(null); setPage(page - 1); setEditor(null); }} />
      <Text accessibilityLiveRegion="polite" style={s.tileLabel}>Page {data?.page.page ?? 1} of {totalPages}</Text>
      <Action title="Next" label="Next transaction page" disabled={loading || busy || page >= totalPages} onPress={() => { setError(null); setPage(page + 1); setEditor(null); }} />
    </View> : null}
    {data?.trash.length ? <Card><Text accessibilityRole="header" style={s.dayLabel}>Recently deleted</Text><Text style={s.tileLabel}>Items remain restorable for 30 days.</Text>
      {data.trash.map(t => <View key={t.id} style={s.trashRow}><View style={{ flex: 1 }}><Text style={s.trashName}>{t.reason ?? t.description ?? t.categoryName ?? 'Transaction'}</Text><Text style={s.tileLabel}>{formatMoney(t.amount, t.currencyCode)} · purge {t.purgeAfter ? formatDate(t.purgeAfter) : 'in 30 days'}</Text></View><Action write title="Restore" disabled={!canWrite || busy} onPress={() => void mutate(t, 'restore')} /></View>)}
    </Card> : null}
  </ScrollView>
    {canWrite ? <PressableScale testID="transactions-add" onPress={() => router.navigate({ pathname: '/(tabs)/assistant', params: { compose: 'log', at: String(Date.now()) } })} accessibilityRole="button" accessibilityLabel="Add transaction" layer="on-primary"
      style={[s.fab, { bottom: dock + 12 }, theme.elevation.level2]}><Icon name={{ android: 'add', ios: 'plus' }} color={theme.color.onPrimary} /><Text style={s.fabLabel}>Add</Text></PressableScale> : null}
    {undo ? <View style={[s.toast, { bottom: dock + 12 }]} accessibilityLiveRegion="polite"><Text style={s.toastText}>Moved to Recently Deleted.</Text><Action write title="Undo" disabled={!canWrite || busy} onPress={() => void mutate(undo, 'restore')} /><Action title="×" label="Dismiss undo" onPress={() => setUndo(null)} /></View> : null}
    <Choice hidden open={monthMenu} setOpen={setMonthMenu} label="Transaction month" value={month} options={getMonthOptions(month).map(value => ({ value, label: formatMonthKey(value) }))} onChange={changeMonth} />
    {editor && canWrite ? <TransactionEditor transaction={editor.transaction} catalog={data?.catalog ?? null} form={editor.form} setForm={form => setEditor({ ...editor, form })} saving={busy} error={error} close={() => setEditor(null)} save={() => void mutate(editor.transaction, 'save')}
      onDelete={() => { const t = editor.transaction; setEditor(null); void mutate(t, 'delete'); }} /> : null}
  </View>;
}
function localDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function IconStep({ icon, label, disabled, onPress }: { icon: IconName; label: string; disabled: boolean; onPress: () => void }) {
  const { color } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.38 : 1 }}><Icon name={icon} color={color.text} /></Pressable>;
}
const makeStyles = (t: ThemeValue) => ({
  fill: { flex: 1, backgroundColor: t.color.bg },
  content: { paddingHorizontal: t.layout.gutter, paddingTop: 4, gap: 16 },
  stepper: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  monthButton: { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, flexShrink: 1 },
  month: { ...t.type.title, color: t.color.text, flexShrink: 1 },
  tiles: { flexDirection: 'row' as const, gap: 12, flexWrap: 'wrap' as const },
  tile: { flex: 1, minWidth: 140, gap: 6 },
  tileHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  tileLabel: { ...t.type.caption, color: t.color.text2 },
  group: { gap: 2 },
  dayHead: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingTop: 8 },
  dayLabel: { ...t.type.labelS, color: t.color.text2 },
  pager: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  trashRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  trashName: { ...t.type.label, color: t.color.text },
  fab: { position: 'absolute' as const, right: t.layout.gutter, height: 56, paddingHorizontal: 20, borderRadius: t.radius.l, backgroundColor: t.color.primary, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  fabLabel: { ...t.type.label, color: t.color.onPrimary },
  toast: { position: 'absolute' as const, left: t.layout.gutter, right: t.layout.gutter, minHeight: 56, borderRadius: t.radius.m, backgroundColor: t.color.text, flexDirection: 'row' as const, alignItems: 'center' as const, paddingLeft: 16, gap: 4 },
  toastText: { ...t.type.label, color: t.color.bg, flex: 1 },
});
