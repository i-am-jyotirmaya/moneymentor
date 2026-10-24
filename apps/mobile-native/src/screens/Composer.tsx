import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useHeaderHeight } from '@react-navigation/elements';
import { ApiError, formatMoney, type Transaction } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { OperationNotice, useOperations } from '../state/operations';
import { Button, Card, ErrorNotice, Field, useStyles } from '../ui/primitives';
import { useTheme } from '../ui/theme';
import { ChatExchange } from '../ui/ChatExchange';
import { Icon } from '../ui/Icon';
import { VoiceInput } from '../ui/VoiceInput';
import type { ScreenProps } from '../navigation';

export function ComposerScreen({ navigation }: ScreenProps<'Composer'>) {
  const styles = useStyles();
  const { color } = useTheme();

  const entry = useEntry();
  const operations = useOperations();
  const query = useQueryClient();
  const headerHeight = useHeaderHeight();
  const [error, setError] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const refresh = () => { void query.invalidateQueries(); };
  const confirmed = async (transaction: Transaction) => {
    // The receipt is authoritative even if subsequent local cleanup fails.
    await entry.complete(transaction); refresh();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    Keyboard.dismiss();
  };
  const submitAssistant = () => { void entry.runExclusive(async () => {
    if (!entry.resources.canWrite || entry.draft.pendingManual || !entry.draft.text.trim() || entry.draft.assistantUncertain || voiceBusy || operations.blocked) return;
    setError(null);
    const before = entry.draft;
    const pending = { ...before, assistantUncertain: true };
    try {
      entry.update(pending); await entry.persist(pending);
      let result;
      try { result = await entry.client.sendAssistant(before.text, entry.resources.settings.currencyCode, entry.resources.today, { inputMode: before.inputMode ?? 'Text', householdId: entry.resources.householdId }); }
      catch (caught) {
        if (caught instanceof ApiError && caught.outcome === 'rejected') entry.update({ assistantUncertain: false });
        setError(caught instanceof Error ? caught.message : 'The message could not be delivered.');
        return;
      }
      await entry.recordExchange(before.text, result.assistantMessage ?? result.errors?.[0] ?? (result.transaction ? 'Transaction saved.' : 'Please add more detail.'), result.transaction?.id ?? null);
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
      {entry.historyError ? <Text style={styles.caption}>{entry.historyError}</Text> : null}
    </ScrollView></SafeAreaView>;
  }
  const legacyPending = !!entry.draft.pendingManual;
  const disabled = entry.busy || operations.blocked || legacyPending || entry.draft.assistantUncertain || voiceBusy || !entry.resources.canWrite;
  return <SafeAreaView style={styles.screen} edges={['bottom']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.content}>
      <View style={styles.row}><Icon name="assistant" /><Text accessibilityRole="header" style={styles.heading}>Your money, in a conversation.</Text></View>
      <Text style={styles.caption}>Track spending, record income, or ask about your money. Just type or speak naturally.</Text>
      <OperationNotice refresh={() => query.refetchQueries({ type: 'active' }, { throwOnError: true })} />
      {legacyPending ? <Card>
        <Text accessibilityRole="alert" style={styles.body}>An earlier manual save may already have completed. Review recent transactions before clearing it. Manual transaction creation is no longer available.</Text>
        <Button title="Check recent transactions" secondary onPress={() => navigation.popToTop()} />
        <Button title="I checked — clear pending draft" secondary disabled={entry.busy} onPress={() => { void entry.runExclusive(async () => { try { await entry.discardDraft(); setError(null); } catch { setError('The pending draft could not be cleared securely.'); } }); }} />
      </Card> : null}
      {entry.conversation.slice(-6).map(exchange => <ChatExchange key={exchange.id} text={exchange.text} reply={exchange.reply} />)}
      {entry.reply && entry.conversation.at(-1)?.reply !== entry.reply ? <Card><Text accessibilityLiveRegion="polite" style={styles.body}>{entry.reply}</Text></Card> : null}
      {!entry.conversation.length && !entry.reply ? <Card>
        <Text style={styles.heading}>What’s on your mind?</Text>
        <Text style={styles.body}>“Groceries for 240 using Kotak upi”</Text>
        <Text style={styles.caption}>Or try “Where did I spend most this month?”</Text>
      </Card> : null}
      <Card>
        <Field label="Transaction message" placeholder="Tell Spndrr what happened…" multiline maxLength={4000} value={entry.draft.text}
          editable={!disabled} onChangeText={text => entry.update({ text, ...(text ? {} : { inputMode: 'Text' }) })} testID="assistant-input" />
        <VoiceInput text={entry.draft.text} disabled={entry.busy || operations.blocked || legacyPending || entry.draft.assistantUncertain || !entry.resources.canWrite} onBusyChange={setVoiceBusy} onTranscript={text => entry.update({ text, inputMode: 'Voice' })} />
        <Text style={styles.caption}>Sending can save a transaction immediately. Spndrr asks for any missing details.</Text>
        {entry.draft.assistantUncertain ? <>
          <Text accessibilityRole="alert" style={styles.body}>This message may already have been saved. Check recent transactions before sending it again.</Text>
          <Button title="Check recent transactions" secondary onPress={() => navigation.popToTop()} />
          <Button title="I checked — allow another message" secondary disabled={entry.busy} onPress={() => {
            entry.update({ assistantUncertain: false }); void entry.persist().catch(() => undefined);
          }} />
        </> : <Button title="Send & track" onPress={submitAssistant} loading={entry.busy} disabled={disabled || !entry.draft.text.trim()} testID="send-assistant" />}
      </Card>
      {error ? <ErrorNotice message={error} /> : null}
      {entry.persistenceError ? <ErrorNotice message={entry.persistenceError} onRetry={() => { void entry.persist().catch(() => undefined); }} /> : null}
      <Text style={styles.caption}>Your unsent message stays on this device when you close the assistant.</Text>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
