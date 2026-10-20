import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { categoryOptions, type Category } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { useWorkspace, useWorkspaceMutation } from '../state/workspace';
import { OperationNotice } from '../state/operations';
import { Button, Card, ErrorNotice, Field, styles } from '../ui/primitives';
import { ChoiceField, Page, Toggle } from '../ui/forms';
import { choices, ScopeLabel } from '../ui/workspace';
import { useFormExit } from '../ui/useFormExit';
import type { FeatureNavigationProps, ScreenProps } from '../navigation';

export function CategoriesScreen({ navigation }: FeatureNavigationProps) {
  const entry = useEntry(); const mutation = useWorkspaceMutation(); const [search, setSearch] = useState('');
  return <Page title="Your categories" error={mutation.error} onRefresh={() => { void mutation.refresh(); }}><ScopeLabel />
    <OperationNotice refresh={mutation.refresh} /><Button title="Add category" disabled={mutation.blocked} onPress={() => navigation.navigate('CategoryForm')} />
    <Field label="Find a category" value={search} onChangeText={setSearch} />
    {entry.resources.categories.filter(item => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(item => <Card key={item.id}>
      <Text style={styles.heading}>{item.name}</Text><Text style={styles.caption}>{item.type} · {item.classification} · {item.isSystemCategory ? 'System' : 'Custom'}{item.isHidden ? ' · Hidden' : ''}</Text>
      {item.parentCategoryId ? <Text style={styles.caption}>Under {entry.resources.categories.find(parent => parent.id === item.parentCategoryId)?.name ?? 'another category'}</Text> : null}
      <Button title={`Manage ${item.name}`} secondary onPress={() => navigation.navigate('CategoryForm', { id: item.id })} />
    </Card>)}
  </Page>;
}

export function CategoryFormScreen({ navigation, route }: ScreenProps<'CategoryForm'>) {
  const entry = useEntry(); const { api, scope } = useWorkspace(); const mutation = useWorkspaceMutation();
  const original = entry.resources.categories.find(item => item.id === route.params?.id);
  const [name, setName] = useState(original?.name ?? ''); const [type, setType] = useState<Category['type']>(original?.type ?? 'Expense');
  const [classification, setClassification] = useState<Category['classification']>(original?.classification ?? 'Discretionary');
  const [parent, setParent] = useState(original?.parentCategoryId ?? 'none'); const [hidden, setHidden] = useState(original?.isHidden ?? false);
  const [icon, setIcon] = useState(original?.icon ?? ''); const [saved, setSaved] = useState(false);
  useFormExit({ name, type, classification, parent, hidden, icon }, mutation.busy, saved, navigation);
  const save = () => {
    if (!name.trim()) { mutation.setError('Give this category a name.'); return; }
    void mutation.execute(original ? 'Update category' : 'Add category', () => original
      ? api.updateCategory(original.id, { name: name.trim(), parentCategoryId: parent === 'none' ? null : parent, classification, isHidden: hidden, icon: icon.trim() })
      : api.createCategory({ householdId: scope, name: name.trim(), type, classification, ...(parent !== 'none' ? { parentCategoryId: parent } : {}), ...(icon.trim() ? { icon: icon.trim() } : {}) }), () => setSaved(true));
  };
  const remove = () => { if (!original || original.isSystemCategory) return; Alert.alert('Delete custom category?', 'Spndrr checks whether this category can be removed. Existing transaction rules remain enforced.', [
    { text: 'Keep category', style: 'cancel' }, { text: 'Delete category', style: 'destructive', onPress: () => { void mutation.execute('Delete custom category', () => api.deleteCategory(original.id), () => setSaved(true)); } },
  ]); };
  const descendant = (id: string) => { const seen = new Set<string>(); let current = entry.resources.categories.find(item => item.id === id); while (current) { if (current.id === original?.id || seen.has(current.id)) return true; seen.add(current.id); current = entry.resources.categories.find(item => item.id === current?.parentCategoryId); } return false; };
  return <Page title={original ? 'Manage category' : 'Add category'} error={mutation.error}><OperationNotice refresh={mutation.refresh} />
    {route.params?.id && !original ? <ErrorNotice message="This category is no longer available." /> : saved ? <Card><Text accessibilityLiveRegion="polite" style={styles.heading}>Category change saved</Text><Button title="Done" onPress={() => navigation.goBack()} /></Card> : <>
      {original?.isSystemCategory ? <Text style={styles.caption}>System categories are read only. Create a custom category to organize new entries.</Text> : null}
      <Field label="Category name" testID="category-name-input" value={name} onChangeText={setName} maxLength={100} editable={!mutation.blocked && !original?.isSystemCategory} />
      <ChoiceField label="Category type" value={type} options={choices(['Expense', 'Income'])} disabled={mutation.blocked || !!original} onChange={value => { setType(value as Category['type']); setClassification(value === 'Income' ? 'Income' : 'Discretionary'); setParent('none'); }} />
      <ChoiceField label="Classification" value={classification} options={choices(['Essential', 'Discretionary', 'Income', 'Savings', 'Debt'])} disabled={mutation.blocked || !!original?.isSystemCategory} onChange={value => setClassification(value as Category['classification'])} />
      <ChoiceField label="Parent category" value={parent} options={[...(!original?.parentCategoryId ? [{ id: 'none', label: 'No parent' }] : []), ...categoryOptions(entry.resources.categories, type).filter(item => !item.category.parentCategoryId && !descendant(item.id)).map(item => ({ id: item.id, label: item.label }))]} onChange={setParent} disabled={mutation.blocked || !!original?.isSystemCategory} />
      <Field label="Icon (optional)" value={icon} onChangeText={setIcon} maxLength={32} editable={!mutation.blocked && !original?.isSystemCategory} />
      {original ? <Toggle label="Hide from new transactions" value={hidden} onChange={setHidden} disabled={mutation.blocked || original.isSystemCategory} /> : null}
      {!original?.isSystemCategory ? <Button title="Save category" disabled={mutation.blocked} loading={mutation.busy} onPress={save} /> : null}
      {original && !original.isSystemCategory ? <Button title="Delete category" secondary disabled={mutation.blocked} onPress={remove} /> : null}
    </>}
  </Page>;
}
