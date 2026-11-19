// Kept out of ./ui so modules (and tests) that only need Action/Panel don't load the A4 Sheet's worklets.
import { useState } from 'react';
import { Keyboard, View } from 'react-native';
import { Sheet } from '../ui/Sheet';
import { Action } from './ui';

/** `hidden` + `open`/`setOpen` let a screen supply its own trigger (e.g. the Transactions month stepper). */
export function Choice({ label, value, options, onChange, disabled = false, hidden = false, open: openProp, setOpen: setOpenProp, testID }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean; hidden?: boolean; open?: boolean; setOpen?: (open: boolean) => void; testID?: string }) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = setOpenProp ?? setOpenState;
  return <>{hidden ? null : <Action testID={testID} title={options.find(option => option.value === value)?.label ?? value} label={label} disabled={disabled} onPress={() => { Keyboard.dismiss(); setOpen(true); }} />}
    <Sheet open={open} onClose={() => setOpen(false)} title={label} testID={testID ? `${testID}-sheet` : undefined}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 4 }}>{options.map(option => <Action key={option.value} testID={testID ? `${testID}-${option.value}` : undefined} title={option.label} selected={value === option.value} onPress={() => { onChange(option.value); setOpen(false); }} />)}</View>
    </Sheet></>;
}
