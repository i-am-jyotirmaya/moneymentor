import { useState } from 'react';
import { Alert } from 'react-native';
import { usePreventRemove, type NavigationAction } from '@react-navigation/native';

export function useFormExit(snapshot: unknown, busy: boolean, saved: boolean, navigation: { dispatch: (action: NavigationAction) => void }) {
  const serialized = JSON.stringify(snapshot); const [baseline] = useState(serialized);
  usePreventRemove(busy || (!saved && serialized !== baseline), ({ data }) => {
    if (busy) { Alert.alert('Finishing your change', 'Wait for the save result before closing this form.'); return; }
    Alert.alert('Discard unsaved changes?', 'The details in this form have not been saved.', [
      { text: 'Keep editing', style: 'cancel' }, { text: 'Discard changes', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
}
