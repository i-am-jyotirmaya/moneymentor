import { useState } from 'react';
import { Alert } from 'react-native';
import { usePreventRemove, type NavigationAction } from '@react-navigation/native';
import { useOperations } from '../state/operations';

export function useFormExit(snapshot: unknown, busy: boolean, saved: boolean, navigation: { dispatch: (action: NavigationAction) => void }) {
  const serialized = JSON.stringify(snapshot); const [baseline] = useState(serialized);
  const operations = useOperations();
  usePreventRemove(busy || (!saved && serialized !== baseline), ({ data }) => {
    if (busy) { Alert.alert('Finishing your change', 'Wait for the save result before closing this form.'); return; }
    Alert.alert(operations.pending ? 'Change not confirmed' : 'Discard unsaved changes?', operations.pending ? 'The earlier change may already be saved. Closing keeps its safety marker so you can review the saved data.' : 'Closing will discard the unsaved details in this form.', [
      { text: 'Keep editing', style: 'cancel' }, { text: 'Discard changes', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
}
