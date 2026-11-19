import { useOffline } from '../../src/workspace/connection';
import { useSectionLoad, useSections, useSectionBanner } from '../../src/workspace/sections';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../src/auth/session';
import { PlaceholderInput } from '../../src/ui/AuthForm';
import { colors, styles } from '../../src/ui/theme';
import { useWorkspace } from '../../src/workspace/context';
import { assistantError, buildAssistantRequest, initialAssistantMessages, looksLikeFinanceQuestion, responseMessage, userMessage } from '../../src/workspace/assistant-data';
import { ws } from '../../src/workspace/ui';

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
  return <View ref={root} testID="assistant-screen" style={ws.fill} onLayout={() => root.current?.measureInWindow((_x, y) => setKeyboardOffset(y))}>
    <KeyboardAvoidingView style={ws.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={keyboardOffset}>
      <View style={[chat.header, ws.row]}><View style={{ flex: 1 }}><Text style={chat.title}>What did you spend or receive?</Text><Text style={styles.text}>Type naturally.</Text></View></View>
      <ScrollView ref={list} style={{ flex: 1 }} contentContainerStyle={chat.messages} keyboardShouldPersistTaps="handled" onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })} onLayout={() => list.current?.scrollToEnd({ animated: false })}>
        {messages.map((message, index) => <View key={index} testID={`assistant-message-${index}`} style={[chat.bubble, message.role === 'user' ? chat.user : chat.assistant]}><Text style={chat.messageText}>{message.text}</Text>{message.addedToTransactions ? <Text style={chat.confirmation} accessibilityLiveRegion="polite">Added to Transactions</Text> : null}</View>)}
        {busy ? <View style={[chat.bubble, chat.assistant, chat.pending]} accessible accessibilityRole="progressbar" accessibilityLabel="Sending message" accessibilityState={{ busy: true }} accessibilityLiveRegion="polite"><View style={[chat.skeleton, { width: '100%' }]} /><View style={[chat.skeleton, { width: '62%' }]} /></View> : null}
      </ScrollView>
      <View style={chat.composer}>{error && !offline && !banner ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}<View style={chat.inputRow}>
        <PlaceholderInput testID="assistant-input" accessibilityLabel="Message Spndrr" wrapperStyle={chat.inputWrapper} style={chat.input} multiline maxLength={4000} editable={!offline} placeholder={offline ? "You're offline" : "spent 500 on groceries or got salary 50000"} placeholderTextColor={colors.muted2} value={text} onChangeText={setText} />
        <Pressable testID="assistant-send" accessibilityRole="button" accessibilityLabel={busy ? 'Sending message' : 'Send message'} accessibilityState={{ disabled: busy || offline, busy }} disabled={busy || offline} accessibilityHint={offline ? "You're offline" : undefined} onPress={() => void submit()} style={[chat.send, busy && { opacity: 0.65 }]}><Text maxFontSizeMultiplier={1} style={styles.buttonText}>Send</Text></Pressable>
      </View></View>
    </KeyboardAvoidingView>
  </View>;
}
const chat = StyleSheet.create({
  header: { padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderColor: colors.border },
  title: { fontSize: 16, fontWeight: '600', color: colors.ink },
  messages: { paddingHorizontal: 12, paddingVertical: 20, gap: 12 },
  bubble: { maxWidth: '82%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.accentSoft, borderBottomRightRadius: 4 },
  assistant: { alignSelf: 'flex-start', backgroundColor: 'white', borderBottomLeftRadius: 4 },
  messageText: { color: colors.ink, fontSize: 14, fontWeight: '500', lineHeight: 24 },
  confirmation: { color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 8 },
  pending: { width: 176, gap: 8 },
  skeleton: { height: 10, borderRadius: 5, backgroundColor: colors.surface },
  composer: { padding: 12, gap: 8, backgroundColor: 'white', borderTopWidth: 1, borderColor: colors.border },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  inputWrapper: { flex: 1, minWidth: 0 },
  input: { minHeight: 56, maxHeight: 112, borderRadius: 28, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 16, textAlignVertical: 'top', color: colors.ink },
  send: { flexGrow: 0, flexShrink: 0, height: 56, width: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
