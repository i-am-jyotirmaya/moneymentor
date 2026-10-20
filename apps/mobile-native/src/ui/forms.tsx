import { useState, type ReactNode } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useHeaderHeight } from '@react-navigation/elements';
import { Button, ErrorNotice, Field, KeyboardDismissButton, Selection, styles, useReducedMotion } from './primitives';
import { color } from './theme';

export function Page({ title, subtitle, children, error, onRefresh, refreshing = false, keyboardOffset }: {
  title?: string; subtitle?: string; children: ReactNode; error?: string | null;
  onRefresh?: () => void; refreshing?: boolean; keyboardOffset?: number;
}) {
  const headerHeight = useHeaderHeight();
  return <SafeAreaView style={styles.screen} edges={['bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? keyboardOffset ?? headerHeight : 0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.ink} colors={[color.ink]} /> : undefined}>
        {title ? <Text accessibilityRole="header" style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.caption}>{subtitle}</Text> : null}
        {error ? <ErrorNotice message={error} /> : null}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export type Choice = { id: string; label: string; detail?: string };
export function ChoiceField({ label, value, options, onChange, disabled, error, placeholder = 'Choose…' }: {
  label: string; value: string | null; options: Choice[]; onChange: (value: string) => void; disabled?: boolean; error?: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const reduced = useReducedMotion();
  const selected = options.find(option => option.id === value);
  const close = () => { Keyboard.dismiss(); setOpen(false); setSearch(''); };
  return <>
    <Selection label={label} value={selected?.label ?? placeholder} disabled={disabled} error={error} onPress={() => { Keyboard.dismiss(); setOpen(true); }} />
    <Modal visible={open} animationType={reduced ? 'none' : 'slide'} presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={close}>
      <SafeAreaView style={styles.screen} accessibilityViewIsModal>
        <View style={[styles.content, styles.row, { justifyContent: 'space-between', paddingBottom: 8 }]}>
          <Text accessibilityRole="header" style={styles.heading}>{label}</Text><KeyboardDismissButton /><Button title="Close" secondary onPress={close} />
        </View>
        <FlatList data={options.filter(option => `${option.label} ${option.detail ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))}
          keyExtractor={option => option.id} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          ListHeaderComponent={<Field label={`Search ${label.toLocaleLowerCase()}`} value={search} onChangeText={setSearch} autoCorrect={false} autoCapitalize="none" />}
          ListEmptyComponent={<Text style={styles.caption}>No matching options.</Text>}
          renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityLabel={item.detail ? `${item.label}, ${item.detail}` : item.label}
            accessibilityState={{ checked: value === item.id }} onPress={() => { onChange(item.id); close(); }}
            style={{ minHeight: 64, borderRadius: 18, borderWidth: 1, borderColor: color.border, padding: 18, backgroundColor: value === item.id ? color.tint : color.surface, gap: 6 }}>
            <Text style={styles.body}>{item.label}{value === item.id ? '  ✓' : ''}</Text>{item.detail ? <Text style={styles.caption}>{item.detail}</Text> : null}
          </Pressable>} />
      </SafeAreaView>
    </Modal>
  </>;
}

export function Toggle({ label, value, onChange, disabled, detail }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean; detail?: string }) {
  return <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap', minHeight: 52 }]}>
    <View style={{ flex: 1 }}><Text style={styles.body}>{label}</Text>{detail ? <Text style={styles.caption}>{detail}</Text> : null}</View>
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: color.ink }} />
  </View>;
}

function localDate(value: string) {
  const parts = value.split('-').map(Number); return new Date(parts[0] ?? 2026, (parts[1] ?? 1) - 1, parts[2] ?? 1, 12);
}
export function CalendarField({ label, value, onChange, today, allowFuture = false, optional = false, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; today: string; allowFuture?: boolean; optional?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pick = (date?: Date) => { if (date) onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`); };
  const start = () => { Keyboard.dismiss();
    if (Platform.OS === 'android') DateTimePickerAndroid.open({ value: localDate(value || today), mode: 'date', maximumDate: allowFuture ? undefined : localDate(today), onChange: (_, date) => pick(date) });
    else setOpen(previous => !previous);
  };
  return <View style={{ gap: 8 }}><Selection label={label} value={value || 'Not set'} onPress={start} disabled={disabled} />
    {open && !disabled ? <DateTimePicker accessibilityLabel={label} value={localDate(value || today)} mode="date" display="inline" maximumDate={allowFuture ? undefined : localDate(today)} onChange={(_, date) => pick(date)} /> : null}
    {optional && value ? <Button title={`Clear ${label.toLocaleLowerCase()}`} secondary disabled={disabled} onPress={() => { onChange(''); setOpen(false); }} /> : null}
  </View>;
}

export function MoneyField({ label, currency, value, onChange, disabled, error, testID }: { label: string; currency: string; value: string; onChange: (value: string) => void; disabled?: boolean; error?: string; testID?: string }) {
  return <Field label={`${label} (${currency})`} value={value} onChangeText={onChange} keyboardType="decimal-pad" inputMode="decimal" maxLength={15} editable={!disabled} error={error} placeholder="0.00" testID={testID} />;
}
