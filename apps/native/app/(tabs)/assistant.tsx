import { useOffline } from '../../src/workspace/connection';
import { useSectionLoad, useSections, useSectionBanner } from '../../src/workspace/sections';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import type { CategoryCatalog, Transaction } from '../../src/api/models';
import { TransactionEditor } from '../../src/workspace/transaction-editor';
import { buildTransactionPatch, toTransactionEditForm, validateTransactionEdit, type TransactionEditForm } from '../../src/workspace/transactions-data';
import { useSession } from '../../src/auth/session';
import { PlaceholderInput } from '../../src/ui/AuthForm';
import { Chip, Icon, PressableScale, TxRow, useThemedStyles, type IconName } from '../../src/ui';
import { useTheme, type ThemeValue } from '../../src/ui/ThemeProvider';
import { useDockSpace } from '../../src/workspace/dock';
import { useWorkspace } from '../../src/workspace/context';
import { askExamples, assistantError, buildAssistantRequest, hasConversation, initialAssistantMessages, logExamples, looksLikeFinanceQuestion, responseMessage, userMessage } from '../../src/workspace/assistant-data';

export default function Assistant() {
  const { session } = useSession();
  return <AssistantChat key={session?.user.id} />;
}
function AssistantChat() {
  const { client } = useSession();
  const workspace = useWorkspace();
  const offline = useOffline();
  const banner = useSectionBanner('assistant');
  const { cache } = useSections();
  const history = useSectionLoad('assistant', 'assistant-history', async () => (cache.get('assistant-history')?.data as ReturnType<typeof initialAssistantMessages> | undefined) ?? initialAssistantMessages());
  const setHistory = history.setData;
  const [messages, setMessages] = useState(() => history.data ?? initialAssistantMessages());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  const root = useRef<ComponentRef<typeof View>>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const theme = useTheme();
  const s = useThemedStyles(makeStyles);
  const dock = useDockSpace();
  // Dashboard "Add" / "Ask" (and the Transactions FAB) open this tab with the composer focused.
  // Each request carries a fresh `at`, so the input remounts focused even when the mode repeats.
  const { compose, at } = useLocalSearchParams<{ compose?: string; at?: string }>();
  const [fillNonce, setFillNonce] = useState(0);
  const focusKey = `${compose ?? ''}:${at ?? ''}:${fillNonce}`;
  const autoFocus = !!at || fillNonce > 0;
  function fill(example: string) { setText(example); setFillNonce(n => n + 1); }
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setHistory(messages); }, [messages, setHistory]);
  async function submit() {
    if (offline || !text.trim() || lock.current) return;
    const selected = workspace.households?.households.find(h => h.id === workspace.householdId);
    if (selected?.canWrite === false && !looksLikeFinanceQuestion(text.trim())) {
      setError('This household is read-only for Viewers. You can still ask finance questions.'); return;
    }
    lock.current = true; setBusy(true); setError(null);
    const request = buildAssistantRequest(text, workspace.settings?.currencyCode ?? workspace.dashboard?.currencyCode ?? 'INR', workspace.householdId);
    setMessages(current => [...current, userMessage(text)]); setText('');
    try {
      const result = await client.sendAssistant(request);
      if (result.transaction) workspace.retry();
      if (alive.current) setMessages(current => [...current, responseMessage(result)]);
    } catch (caught) { if (alive.current) setError(assistantError(caught)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const [editor, setEditor] = useState<{ index: number; transaction: Transaction; form: TransactionEditForm; catalog: CategoryCatalog | null } | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  function openEditor(index: number) {
    const tx = messages[index]?.transaction;
    if (!tx) return;
    setEditorError(null);
    setEditor({ index, transaction: tx, form: toTransactionEditForm(tx), catalog: null });
    void client.categories(tx.householdId).then(catalog => setEditor(current => current && current.transaction.id === tx.id ? { ...current, catalog } : current)).catch(() => undefined);
  }
  async function saveEditor() {
    if (!editor || offline || lock.current) return;
    const invalid = validateTransactionEdit(editor.form);
    if (invalid) { setEditorError(invalid); return; }
    lock.current = true; setBusy(true); setEditorError(null);
    try {
      const updated = await client.updateTransaction(editor.transaction.id, buildTransactionPatch(editor.transaction, editor.form));
      workspace.retry();
      if (alive.current) { setMessages(current => current.map((m, i) => i === editor.index ? { ...m, transaction: updated } : m)); setEditor(null); }
    } catch (caught) { if (alive.current) setEditorError(assistantError(caught)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function undoLogged(index: number) {
    const tx = messages[index]?.transaction;
    if (!tx || offline || lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await client.deleteTransaction(tx.id);
      workspace.retry();
      if (alive.current) setMessages(current => current.map((m, i) => i === index ? { ...m, undone: true } : m));
    } catch (caught) { if (alive.current) setError(assistantError(caught)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const conversation = hasConversation(messages);
  const placeholder = offline ? "You're offline" : 'Log a spend or ask…';
  return <View ref={root} testID="assistant-screen" style={[s.fill, { paddingBottom: dock }]} onLayout={() => root.current?.measureInWindow((_x, y) => setKeyboardOffset(y))}>
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={keyboardOffset}>
      <ScrollView ref={list} style={{ flex: 1 }} contentContainerStyle={s.messages} keyboardShouldPersistTaps="handled" onContentSizeChange={() => conversation && list.current?.scrollToEnd({ animated: true })} onLayout={() => conversation && list.current?.scrollToEnd({ animated: false })}>
        {!conversation ? <View testID="assistant-empty" style={s.empty}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={s.display}>Log it, or ask about it.</Text>
          <Text style={s.body}>Type what you spent or received the way you’d text a friend, or ask anything about your money.</Text>
          <View style={s.examples}>{logExamples.map(example => <Example key={example} text={example} icon={{ android: 'north_west', ios: 'arrow.up.left' }} onPress={() => fill(example)} />)}</View>
          <Text style={s.overline}>Or ask</Text>
          <View style={s.examples}>{askExamples.map(example => <Chip key={example} label={example} icon={{ android: 'forum', ios: 'bubble.left.and.bubble.right' }} onPress={() => fill(example)} />)}</View>
        </View> : messages.map((message, index) => message.role === 'user'
          ? <View key={index} testID={`assistant-message-${index}`} style={[s.bubble, s.user]}><Text style={s.userText}>{message.text}</Text></View>
          : <Animated.View key={index} entering={FadeInDown.duration(theme.motion.duration.base).reduceMotion(ReduceMotion.System)} testID={`assistant-message-${index}`} style={[s.bubble, s.assistant]}>
            {message.transaction ? <View style={{ gap: 10 }}>
              <TxRow tx={message.transaction} />
              {message.undone
                ? <View style={s.confirm} accessibilityLiveRegion="polite"><Icon name={{ android: 'undo', ios: 'arrow.uturn.backward' }} size={18} color={theme.color.text2} /><Text style={[s.confirmText, { color: theme.color.text2 }]}>Removed from Transactions</Text></View>
                : <><View style={s.confirm} accessibilityLiveRegion="polite"><Icon name={{ android: 'check_circle', ios: 'checkmark.circle.fill' }} size={18} color={theme.color.income} /><Text style={s.confirmText}>Added to Transactions</Text></View>
                  <View style={s.cardActions}>
                    <SmallButton icon={{ android: 'edit', ios: 'pencil' }} label="Edit" disabled={busy || offline} onPress={() => openEditor(index)} />
                    <SmallButton icon={{ android: 'undo', ios: 'arrow.uturn.backward' }} label="Undo" disabled={busy || offline} onPress={() => void undoLogged(index)} />
                  </View></>}
              {message.text ? <Text style={s.assistantText}>{message.text}</Text> : null}
            </View> : <><Text style={s.assistantText}>{message.text}</Text>{message.addedToTransactions ? <Text style={s.confirmText} accessibilityLiveRegion="polite">Added to Transactions</Text> : null}</>}
          </Animated.View>)}
        {busy ? <View style={[s.bubble, s.assistant, s.pending]} accessible accessibilityRole="progressbar" accessibilityLabel="Sending message" accessibilityState={{ busy: true }} accessibilityLiveRegion="polite"><TypingDots /></View> : null}
      </ScrollView>
      <View style={s.composer}>{error && !offline && !banner ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}<View style={s.inputRow}>
        <PlaceholderInput key={focusKey} autoFocus={autoFocus} testID="assistant-input" accessibilityLabel="Message Spndrr"
          wrapperStyle={s.inputWrapper} style={[s.inputText, s.input, Platform.OS === 'ios' && !text && s.emptyInput]}
          placeholderStyle={s.inputText}
          placeholderOverlayStyle={s.inputPlaceholderOverlay} multiline maxLength={4000} editable={!offline}
          placeholder={placeholder} placeholderTextColor={theme.color.text3} value={text} onChangeText={setText} />
        <Pressable testID="assistant-send" accessibilityRole="button" accessibilityLabel={busy ? 'Sending message' : 'Send message'} accessibilityState={{ disabled: busy || offline, busy }} disabled={busy || offline} accessibilityHint={offline ? "You're offline" : undefined} onPress={() => void submit()} style={[s.send, (busy || !text.trim()) && { opacity: 0.6 }]}>
          <Icon name={{ android: 'arrow_upward', ios: 'arrow.up' }} color={theme.color.onPrimary} />
        </Pressable>
      </View></View>
    </KeyboardAvoidingView>
    {editor ? <TransactionEditor transaction={editor.transaction} catalog={editor.catalog} form={editor.form} setForm={form => setEditor({ ...editor, form })} saving={busy} error={editorError}
      close={() => setEditor(null)} save={() => void saveEditor()} onDelete={() => { const index = editor.index; setEditor(null); void undoLogged(index); }} /> : null}
  </View>;
}
function Example({ text, icon, onPress }: { text: string; icon: IconName; onPress: () => void }) {
  const { color, elevation, radius, scheme, type } = useTheme();
  return <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`Example: ${text}`} accessibilityHint="Fills the message box"
    style={[{ alignSelf: 'flex-start', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: radius.m, backgroundColor: scheme === 'dark' ? color.surfaceRaised : color.surface }, scheme === 'dark' ? null : elevation.level1]}>
    <Icon name={icon} size={18} color={color.text2} /><Text style={[type.label, { color: color.text, flexShrink: 1 }]}>{text}</Text>
  </PressableScale>;
}
function SmallButton({ icon, label, onPress, disabled = false }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  const { color, radius, type } = useTheme();
  return <PressableScale onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, borderRadius: radius.m, borderWidth: 1, borderColor: color.outlineStrong, opacity: disabled ? 0.5 : 1 }}>
    <Icon name={icon} size={18} color={color.text} /><Text style={[type.label, { color: color.text }]}>{label}</Text>
  </PressableScale>;
}
/** motion.md: 3 dots, 0.3→1→0.3 over 900ms, 150ms offset; static dots plus "Thinking…" under reduced motion. */
function TypingDots() {
  const { color, type } = useTheme();
  const reduced = useReducedMotion();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    {[0, 1, 2].map(i => <Dot key={i} delay={i * 150} color={color.text2} still={reduced} />)}
    {reduced ? <Text style={[type.caption, { color: color.text2 }]}>Thinking…</Text> : null}
  </View>;
}
function Dot({ delay, color, still }: { delay: number; color: string; still: boolean }) {
  const opacity = useSharedValue(still ? 1 : 0.3);
  useEffect(() => {
    if (still) return;
    opacity.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 450 }), withTiming(0.3, { duration: 450 })), -1));
  }, [delay, still, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, style]} />;
}
const inputInsets = { horizontal: 18, vertical: 16, border: 1 };
const inputMinHeight = 56;
const makeStyles = (t: ThemeValue) => ({
  fill: { flex: 1, backgroundColor: t.color.bg },
  messages: { paddingHorizontal: t.layout.gutter, paddingVertical: 16, gap: 12, flexGrow: 1 },
  empty: { gap: 16, paddingTop: 8 },
  display: { ...t.type.display, color: t.color.text },
  body: { ...t.type.bodyL, color: t.color.text2 },
  overline: { ...t.type.overline, color: t.color.text2, marginTop: 8 },
  examples: { gap: 10, alignItems: 'flex-start' as const },
  bubble: { maxWidth: '86%' as const, paddingHorizontal: 16, paddingVertical: 12, borderRadius: t.radius.l },
  user: { alignSelf: 'flex-end' as const, backgroundColor: t.color.primary, borderBottomRightRadius: 6 },
  userText: { ...t.type.bodyL, color: t.color.onPrimary },
  assistant: { alignSelf: 'flex-start' as const, backgroundColor: t.color.surfaceRaised, borderBottomLeftRadius: 6, ...(t.scheme === 'dark' ? {} : t.elevation.level1) },
  assistantText: { ...t.type.bodyL, color: t.color.text },
  confirm: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  confirmText: { ...t.type.label, color: t.color.income },
  cardActions: { flexDirection: 'row' as const, gap: 10, flexWrap: 'wrap' as const },
  pending: { minWidth: 72 },
  error: { ...t.type.body, color: t.color.negative, backgroundColor: t.color.negativeContainer, borderRadius: t.radius.m, padding: 12 },
  composer: { paddingHorizontal: t.layout.gutter, paddingVertical: 8, gap: 8 },
  inputRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 10 },
  inputWrapper: { flex: 1, minWidth: 0 },
  input: { minHeight: inputMinHeight, maxHeight: 120, borderRadius: 28, backgroundColor: t.scheme === 'dark' ? t.color.surfaceRaised : t.color.surface,
    borderColor: t.color.outline, borderWidth: inputInsets.border, paddingHorizontal: inputInsets.horizontal,
    paddingVertical: inputInsets.vertical, textAlignVertical: 'top' as const, color: t.color.text },
  // iOS can measure the last native text after a programmatic clear.
  emptyInput: { height: Math.max(inputMinHeight, Math.ceil(t.type.body.lineHeight * t.fontScale) + 2 * (inputInsets.vertical + inputInsets.border)) },
  inputText: { ...t.type.body, includeFontPadding: false },
  inputPlaceholderOverlay: { top: inputInsets.vertical + inputInsets.border,
    left: inputInsets.horizontal + inputInsets.border, right: inputInsets.horizontal + inputInsets.border },
  send: { height: 56, width: 56, borderRadius: 28, backgroundColor: t.color.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
});
