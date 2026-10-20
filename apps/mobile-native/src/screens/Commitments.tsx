import { useState } from 'react';
import { Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { categoryOptions, formatMoney, parseMoney, type Commitment, type CommitmentCadence, type CreateCommitment } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { useWorkspace, useWorkspaceMutation } from '../state/workspace';
import { OperationNotice } from '../state/operations';
import { Button, Card, ErrorNotice, Field, Loading, styles } from '../ui/primitives';
import { CalendarField, ChoiceField, MoneyField, Page, Toggle } from '../ui/forms';
import { choices, EmptyState, ScopeLabel } from '../ui/workspace';
import type { FeatureNavigationProps, ScreenProps } from '../navigation';

export function CommitmentsScreen({ navigation }: FeatureNavigationProps) {
  const { api, scope, currency } = useWorkspace(); const mutation = useWorkspaceMutation();
  const data = useQuery({ queryKey: ['commitments', scope], queryFn: () => api.commitments(scope) });
  return <Page title="Your recurring commitments" error={mutation.error} onRefresh={() => { void data.refetch(); }} refreshing={data.isRefetching}>
    <ScopeLabel /><OperationNotice refresh={mutation.refresh} /><Text style={styles.caption}>Plan for recurring expenses and investments. These are commitments, rather than automatic bank payments.</Text>
    <Button title="Add commitment" disabled={mutation.blocked} onPress={() => navigation.navigate('CommitmentForm')} />
    {data.isPending ? <Loading /> : data.isError ? <ErrorNotice message="Commitments could not be loaded." onRetry={() => { void data.refetch(); }} /> : !data.data.length ? <EmptyState title="Know what is coming" detail="Add rent, subscriptions, SIPs and other recurring commitments." /> : data.data.map(item => <Card key={item.id}>
      <Text style={styles.heading}>{item.name}</Text><Text style={styles.body}>{formatMoney(item.amount, currency)} · {item.cadence}</Text>
      <Text style={styles.caption}>{item.transactionType} · Next due {item.nextDueDate} · {item.isActive ? 'Active' : 'Inactive'}{item.categoryName ? ` · ${item.categoryName}` : ''}</Text>
      <Button title={`Manage ${item.name}`} secondary onPress={() => navigation.navigate('CommitmentForm', { id: item.id })} />
      <Button title={item.isActive ? 'Pause commitment' : 'Resume commitment'} secondary disabled={mutation.blocked} onPress={() => { void mutation.execute('Update commitment status', () => api.updateCommitment(item.id, { isActive: !item.isActive })); }} />
    </Card>)}
  </Page>;
}
export function CommitmentFormScreen(props: ScreenProps<'CommitmentForm'>) {
  const { api, scope } = useWorkspace(); const id = props.route.params?.id;
  const data = useQuery({ queryKey: ['commitments', scope], queryFn: () => api.commitments(scope), enabled: !!id });
  const original = data.data?.find(item => item.id === id);
  if (id && (data.isPending || data.isError || !original)) return <Page>{data.isPending ? <Loading /> : <ErrorNotice message="This commitment could not be loaded." onRetry={() => { void data.refetch(); }} />}</Page>;
  return <CommitmentEditor {...props} original={original} />;
}
function CommitmentEditor({ navigation, original }: ScreenProps<'CommitmentForm'> & { original?: Commitment }) {
  const entry = useEntry(); const { api, scope, currency, today } = useWorkspace(); const mutation = useWorkspaceMutation();
  const goals = useQuery({ queryKey: ['goals', scope], queryFn: () => api.goals(scope) });
  const [name, setName] = useState(original?.name ?? ''); const [amount, setAmount] = useState(original ? String(original.amount) : '');
  const [type, setType] = useState<'Expense' | 'Investment'>(original?.transactionType ?? 'Expense'); const [cadence, setCadence] = useState<CommitmentCadence>(original?.cadence ?? 'Monthly');
  const [date, setDate] = useState(original?.nextDueDate ?? today); const [category, setCategory] = useState(original?.categoryId ?? 'none'); const [goal, setGoal] = useState(original?.goalId ?? 'none');
  const [shared, setShared] = useState(original ? original.userProfileId === null : false); const [active, setActive] = useState(original?.isActive ?? true); const [saved, setSaved] = useState(false);
  const save = () => {
    const cents = parseMoney(amount); if (!name.trim() || cents === null) { mutation.setError('Enter a commitment name and a positive amount with up to two decimal places.'); return; }
    const input: CreateCommitment = { householdId: scope, name: name.trim(), amount: cents / 100, transactionType: type, cadence, nextDueDate: date, isShared: shared,
      ...(category === 'none' ? {} : { categoryId: category }), ...(goal === 'none' ? {} : { goalId: goal }) };
    void mutation.execute(original ? 'Update recurring commitment' : 'Create recurring commitment', () => original
      ? api.updateCommitment(original.id, { name: input.name, amount: input.amount, transactionType: type, cadence, nextDueDate: date, categoryId: category === 'none' ? null : category, goalId: goal === 'none' ? null : goal, isActive: active })
      : api.createCommitment(input), () => setSaved(true));
  };
  return <Page title={original ? 'Manage commitment' : 'Plan a commitment'} error={mutation.error}><OperationNotice refresh={mutation.refresh} />
    {saved ? <Card><Text accessibilityLiveRegion="polite" style={styles.heading}>Commitment saved</Text><Button title="Done" onPress={() => navigation.goBack()} /></Card> : <>
      <Field label="Commitment name" testID="commitment-name-input" value={name} onChangeText={setName} maxLength={160} editable={!mutation.blocked} />
      <MoneyField label="Amount" testID="commitment-amount-input" currency={currency} value={amount} onChange={setAmount} disabled={mutation.blocked} />
      <ChoiceField label="Commitment type" value={type} options={choices(['Expense', 'Investment'])} onChange={value => setType(value as 'Expense' | 'Investment')} disabled={mutation.blocked} />
      <ChoiceField label="Cadence" value={cadence} options={choices(['Monthly', 'Quarterly', 'Annual'])} onChange={value => setCadence(value as CommitmentCadence)} disabled={mutation.blocked} />
      <CalendarField label="Next due date" value={date} onChange={setDate} today={today} allowFuture disabled={mutation.blocked} />
      <ChoiceField label="Category (optional)" value={category} options={[{ id: 'none', label: 'No category' }, ...categoryOptions(entry.resources.categories, 'Expense').map(item => ({ id: item.id, label: item.label }))]} onChange={setCategory} disabled={mutation.blocked} />
      <ChoiceField label="Linked goal (optional)" value={goal} options={[{ id: 'none', label: 'No linked goal' }, ...(goals.data ?? []).map(item => ({ id: item.id, label: item.name }))]} onChange={setGoal} disabled={mutation.blocked || goals.isPending || goals.isError} />
      {goals.isError ? <ErrorNotice message="Linked goals could not be loaded." onRetry={() => { void goals.refetch(); }} /> : null}
      {original ? <Toggle label="Commitment is active" value={active} onChange={setActive} disabled={mutation.blocked} /> : <Toggle label="Shared household commitment" value={shared} onChange={setShared} disabled={mutation.blocked} />}
      <Button title="Save commitment" disabled={mutation.blocked} loading={mutation.busy} onPress={save} />
    </>}
  </Page>;
}
