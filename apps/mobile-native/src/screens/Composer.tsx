import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, buildTransactionIntent, formatMoney, ValidationError, type ComposerDraft, type Transaction } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { Button, Card, ErrorNotice, Field, styles } from '../ui/primitives';
import { color } from '../ui/theme';
import { ManualForm } from '../ui/ManualForm';
import type { ScreenProps } from '../navigation';

export function ComposerScreen({ navigation }: ScreenProps<'Composer'>) {
  const entry = useEntry();
  const query = useQueryClient();
  const [mode, setMode] = useState<'assistant' | 'manual'>(entry.draft.pendingManual || entry.draft.manual.amount ? 'manual' : 'assistant');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const refresh = () => { void query.invalidateQueries({ queryKey: ['history'] }); };
  const confirmed = async (transaction: Transaction) => {
    // The receipt is authoritative even if subsequent local cleanup fails.
    await entry.complete(transaction); refresh();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    Keyboard.dismiss();
  };
  const submitManual = () => { void entry.runExclusive(async () => {
    setError(null); setFields({});
    let next: ComposerDraft;
    try {
      const pending = entry.draft.pendingManual ?? { payload: buildTransactionIntent(entry.draft.manual, entry.resources, `native:${Crypto.randomUUID()}`), phase: 'sending' as const };
      next = { ...entry.draft, pendingManual: pending };
      entry.update(next);
      // Persist the reference BEFORE crossing the network write boundary.
      await entry.persist(next);
      let transaction: Transaction;
      try { transaction = await entry.client.createTransaction(pending.payload); }
      catch (caught) {
        if (!(caught instanceof ApiError) || caught.outcome === 'unknown') {
          const uncertain = { ...next, pendingManual: { ...pending, phase: 'uncertain' as const } };
          entry.update(uncertain); await entry.persist(uncertain).catch(() => undefined);
          setError('The save outcome is not confirmed. Retry uses the same reference and details.');
        } else { entry.update({ pendingManual: null }); setError(caught instanceof Error ? caught.message : 'Could not save this transaction.'); }
        return;
      }
      await confirmed(transaction);
    } catch (caught) {
      if (caught instanceof ValidationError) setFields(caught.fields);
      setError(caught instanceof Error ? caught.message : 'Could not prepare the transaction securely.');
    }
  }); };
  const submitAssistant = () => { void entry.runExclusive(async () => {
    if (!entry.draft.text.trim() || entry.draft.assistantUncertain) return;
    setError(null);
    const before = entry.draft;
    const pending = { ...before, assistantUncertain: true };
    try {
      entry.update(pending); await entry.persist(pending);
      let result;
      try { result = await entry.client.sendAssistant(before.text, entry.resources.settings.currencyCode, entry.resources.today); }
      catch (caught) {
        if (caught instanceof ApiError && caught.outcome === 'rejected') entry.update({ assistantUncertain: false });
        setError(caught instanceof Error ? caught.message : 'The message could not be delivered.');
        return;
      }
      if (result.transaction) { await confirmed(result.transaction); return; }
      entry.update({ assistantUncertain: false, text: result.status === 'Failed' || result.status === 'Unsupported' ? before.text : '' });
      entry.setReply(result.assistantMessage ?? result.errors?.[0] ?? 'Please add more detail.');
      await entry.persist().catch(() => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Secure storage is unavailable.');
    }
  }); };

  if (entry.saved) {
    const transaction = entry.saved;
    const editable = (!transaction.kind || ['Purchase', 'Income'].includes(transaction.kind)) && ['Expense', 'Income'].includes(transaction.type);
    return <SafeAreaView style={styles.screen} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
      <Animated.View entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)}>
        <Card><Text accessible={false} style={{ color: color.ink, fontSize: 44 }}>✓</Text>
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.title}>Transaction saved</Text>
          <Text style={styles.title}>{formatMoney(transaction.amount, transaction.currencyCode)}</Text>
          <Text style={styles.body}>{transaction.parentCategoryName ? `${transaction.parentCategoryName} / ` : ''}{transaction.categoryName ?? transaction.kind}</Text>
          <Text style={styles.caption}>{transaction.accountName ?? 'No account specified'} · {transaction.transactionDate.slice(0, 10)}</Text>
          {transaction.description ? <Text style={styles.body}>{transaction.description}</Text> : null}
        </Card>
      </Animated.View>
      {entry.persistenceError ? <ErrorNotice message="The transaction is saved. Clear its local draft before adding another." onRetry={() => { void entry.complete(transaction); }} /> : null}
      {editable ? <Button title="Edit saved transaction" secondary onPress={() => { entry.beginEdit(transaction); navigation.navigate('Edit'); }} /> : null}
      <Button title="Done" onPress={() => navigation.popToTop()} />
    </ScrollView></SafeAreaView>;
  }
  const locked = entry.busy || !!entry.draft.pendingManual;
  return <SafeAreaView style={styles.screen} edges={['bottom']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.content}>
      <Text style={styles.caption}>Your draft stays here when you close this screen.</Text>
      <View style={styles.row}><Button title="Use assistant" onPress={() => setMode('assistant')} disabled={entry.busy || !!entry.draft.pendingManual} secondary={mode !== 'assistant'} />
        <Button title="Enter details" onPress={() => setMode('manual')} disabled={entry.busy || entry.draft.assistantUncertain} secondary={mode !== 'manual'} /></View>
      {mode === 'assistant' ? <>
        <Text accessibilityRole="header" style={styles.heading}>What did you spend on?</Text>
        <Field label="Transaction message" placeholder="Bought groceries for ₹240 using Kotak upi" multiline maxLength={4000} value={entry.draft.text}
          editable={!entry.busy && !entry.draft.assistantUncertain} onChangeText={text => entry.update({ text })} testID="assistant-input" />
        <Text style={styles.caption}>Sending can save a transaction immediately. The assistant asks for missing details.</Text>
        {entry.reply ? <Card><Text accessibilityLiveRegion="polite" style={styles.body}>{entry.reply}</Text></Card> : null}
        {entry.draft.assistantUncertain ? <Card>
          <Text accessibilityRole="alert" style={styles.body}>This message may already have been saved. Check recent transactions before sending it again.</Text>
          <Button title="Check recent transactions" secondary onPress={() => navigation.popToTop()} />
          <Button title="I checked — allow another message" secondary disabled={entry.busy} onPress={() => {
            entry.update({ assistantUncertain: false }); void entry.persist().catch(() => undefined);
          }} />
        </Card> : <Button title="Send & track" onPress={submitAssistant} loading={entry.busy} disabled={!entry.draft.text.trim()} testID="send-assistant" />}
      </> : <>
        <Text accessibilityRole="header" style={styles.heading}>Make it a little clearer.</Text>
        <ManualForm draft={entry.draft.manual} resources={entry.resources} disabled={locked} errors={fields}
          onChange={change => entry.updateManual(change)} onSelect={kind => navigation.navigate('Picker', { kind })} />
        {entry.draft.pendingManual ? <Text accessibilityRole="alert" style={styles.caption}>These details are locked until the outcome is confirmed. Retrying reuses the same transaction reference.</Text> : null}
        <Button title={entry.draft.pendingManual ? 'Retry this transaction' : 'Save transaction'} onPress={submitManual} loading={entry.busy} disabled={entry.draft.assistantUncertain || !entry.resources.canWrite} testID="save-transaction" />
      </>}
      {error ? <ErrorNotice message={error} /> : null}
      {entry.persistenceError ? <ErrorNotice message={entry.persistenceError} onRetry={() => { void entry.persist().catch(() => undefined); }} /> : null}
      <Button title="Hide keyboard" secondary onPress={Keyboard.dismiss} />
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
