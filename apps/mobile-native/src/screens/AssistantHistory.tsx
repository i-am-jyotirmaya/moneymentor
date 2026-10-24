import { ChatExchange } from '../ui/ChatExchange';
import { useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEntry } from '../state/entry';
import { Button, Card, ErrorNotice, useStyles } from '../ui/primitives';
import { EmptyState, ScopeLabel } from '../ui/workspace';
import type { FeatureNavigationProps } from '../navigation';

export function AssistantHistoryScreen({ navigation }: FeatureNavigationProps) {
  const styles = useStyles();

  const entry = useEntry(); const [error, setError] = useState<string | null>(null);
  const clear = () => Alert.alert('Clear this device preview?', 'This removes the conversation preview for this household from this device. Saved transactions and backend records are managed separately.', [
    { text: 'Keep preview', style: 'cancel' }, { text: 'Clear preview', style: 'destructive', onPress: () => { void entry.clearConversation().catch(() => setError('The preview could not be cleared securely.')); } },
  ]);
  return <SafeAreaView style={styles.screen} edges={['bottom']}><FlatList data={entry.conversation} keyExtractor={item => item.id} contentContainerStyle={styles.content}
    ListHeaderComponent={<View style={{ gap: 18 }}><Text style={styles.title}>Your recent conversations</Text><ScopeLabel />
      <Text style={styles.caption}>An encrypted preview on this device, limited to recent exchanges. Spndrr does not currently provide an API to retrieve earlier conversations or sync this preview across devices. Clearing it does not delete saved financial records.</Text>
      {entry.historyError || error ? <ErrorNotice message={error ?? entry.historyError!} /> : null}
      <Button title="Clear on-device preview" secondary disabled={entry.busy} onPress={clear} />
      <Button title="Continue with the assistant" onPress={() => { entry.setSaved(null); navigation.navigate('Composer'); }} disabled={!entry.resources.canWrite} />
    </View>}
    ListEmptyComponent={<EmptyState title="Start a conversation" detail="Your confirmed exchanges on this device will appear here." />}
    renderItem={({ item }) => <Card><Text style={styles.caption}>{item.date.replace('T', ' ').slice(0, 16)} UTC</Text><ChatExchange text={item.text} reply={item.reply} />{item.previewOnly ? <Text style={styles.caption}>Long reply saved as a preview.</Text> : null}
      {item.transactionId ? <Button title="View saved transaction" secondary onPress={() => navigation.navigate('Transaction', { id: item.transactionId! })} /> : null}
    </Card>} />
  </SafeAreaView>;
}
