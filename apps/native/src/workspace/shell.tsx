import { WorkspaceBannerVisible } from './banner';
import { SectionsProvider, SectionBanner, SectionPanel, useSectionBanner } from './sections';
import { showNavLabels } from './section-state';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Modal, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../auth/session';
import { PrivacyPolicySheet } from '../ui/PrivacyPolicySheet';
import { styles } from '../ui/theme';
import { WorkspaceProvider, useWorkspace } from './context';
import { bottomLabel, bottomSections, sectionLabel, sections, type Section } from './navigation';
import { Action, Choice, ErrorNotice, Loading, ws } from './ui';

function Shell() {
  const { client, session, status } = useSession();
  const { households, householdId, setHouseholdId, section } = useWorkspace();
  const [keyboardOpen, setKeyboardOpen] = useState(Keyboard.isVisible());
  const { fontScale } = useWindowDimensions();
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const router = useRouter();
  const pathname = usePathname();
  const active = pathname.split('/').pop() ?? 'assistant';
  const banner = useSectionBanner(active);
  const [menu, setMenu] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  function navigate(section: Section) { setMenu(false); router.navigate(`/(tabs)/${section}`); }
  function signOut() { setMenu(false); void client.logout().catch(() => undefined); }
  async function accept() {
    if (saving) return;
    setSaving(true); setConsentError(null);
    try { await client.acceptPrivacy('2026-07-26-ai-planning.1'); await client.refresh(); }
    catch (caught) { setConsentError(caught instanceof Error ? caught.message : 'Could not record privacy consent.'); }
    finally { setSaving(false); }
  }
  if (status === 'loading' || !session) return <SafeAreaView style={ws.fill}><Loading label="Loading workspace" /></SafeAreaView>;
  if (session.requiresPrivacyConsent) return <SafeAreaView style={ws.fill}><ScrollView contentContainerStyle={[styles.page, { gap: 16 }]}><View style={styles.card}>
    <Text style={styles.link}>Privacy update</Text><Text style={styles.title}>Review the beta privacy policy</Text>
    <Text style={styles.text}>Before finance features reopen, please review and accept version 2026-07-26-ai-planning.1, which discloses minimized AI goal-planning processing. You can still export or delete your account through the API without accepting.</Text>
    <Action title="Read the plain-language policy" onPress={() => setPolicy(true)} />
    <ErrorNotice error={consentError} retry={() => void accept()} />
    <Action title={saving ? 'Recording…' : 'Accept and continue'} disabled={saving} onPress={() => void accept()} /><Action title="Sign out" onPress={signOut} />
  </View></ScrollView><PrivacyPolicySheet visible={policy} onClose={() => setPolicy(false)} /></SafeAreaView>;
  const selected = households?.households.find(h => h.id === householdId);
  return <SafeAreaView edges={keyboardOpen ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']} style={ws.fill}>
    <View style={[ws.row, ws.card, { borderRadius: 0 }]}><Action icon={{ android: "menu", ios: "line.3.horizontal" }} title="Menu" label="Open menu" testID="nav-menu" onPress={() => setMenu(true)} /><View style={{ flex: 1 }}><Text style={ws.small}>Welcome, {session.user.displayName.trim().split(/\s+/)[0] || 'there'}</Text><Text style={ws.heading}>{sectionLabel(active)}</Text></View><Text accessibilityLabel="Spndrr" style={styles.label}>Spndrr</Text></View>
    <SectionBanner banner={banner} />
    {households && households.households.length > 0 ? <View style={[ws.row, { paddingHorizontal: 16 }]}><View style={{ flex: 1 }}><Choice label="Household" value={householdId ?? households.defaultHouseholdId} options={households.households.map(h => ({ value: h.id, label: `${h.name} (${h.kind})` }))} onChange={setHouseholdId} /></View><Text style={ws.small}>{selected?.canWrite ? 'Can write' : 'Read only'}</Text></View> : null}
    <WorkspaceBannerVisible.Provider value={!!banner}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' && active !== 'assistant' ? 'padding' : undefined}>
      {section.blocked && !households && active !== 'assistant' ? <SectionPanel section={section} /> : <Slot />}
    </KeyboardAvoidingView></WorkspaceBannerVisible.Provider>
    {!keyboardOpen ? <View accessibilityLabel="Quick navigation" style={[ws.row, { backgroundColor: 'white', gap: 0, flexWrap: 'nowrap' }]}>{bottomSections.map(section => <Action key={section} hideLabel={!showNavLabels(fontScale)} testID={`nav-${section}`} icon={section === "assistant" ? { android: "smart_toy", ios: "bubble.left" } : section === "transactions" ? { android: "receipt_long", ios: "list.bullet.rectangle" } : { android: "dashboard", ios: "square.grid.2x2" }} title={bottomLabel(section)} selected={active === section} onPress={() => navigate(section)} />)}<Action hideLabel={!showNavLabels(fontScale)} icon={{ android: "menu", ios: "line.3.horizontal" }} title="More" testID="nav-more" onPress={() => setMenu(true)} /></View> : null}
    <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}><View style={ws.scrim}><SafeAreaView style={{ backgroundColor: 'white', maxHeight: '95%' }}><ScrollView contentContainerStyle={ws.content} accessibilityLabel="Mobile menu"><View style={ws.row}><Text style={ws.heading}>Spndrr</Text><Action title="Close menu" onPress={() => setMenu(false)} /></View>{sections.map(item => <Action key={item.section} testID={`menu-${item.section}`} title={item.label} selected={active === item.section} onPress={() => navigate(item.section)} />)}<Text style={styles.label}>{session.user.displayName}</Text><Text style={styles.text}>{session.user.email}</Text><Action testID="menu-sign-out" title="Sign out" onPress={signOut} /></ScrollView></SafeAreaView></View></Modal>
  </SafeAreaView>;
}
export function WorkspaceShell() { const { session } = useSession(); return <SectionsProvider key={session?.user.id}><WorkspaceProvider><Shell /></WorkspaceProvider></SectionsProvider>; }
