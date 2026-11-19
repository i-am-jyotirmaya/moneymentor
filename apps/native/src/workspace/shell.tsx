import { WorkspaceBannerVisible } from './banner';
import { SectionsProvider, SectionBanner, SectionPanel, useSectionBanner } from './sections';
import { showNavLabels } from './section-state';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode, type ComponentRef } from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Image, Keyboard, KeyboardAvoidingView, Platform, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../auth/session';
import { AndroidKeyboardFrame } from '../ui/AndroidKeyboardFrame';
import { PrivacyPolicySheet } from '../ui/PrivacyPolicySheet';
import { colors, styles } from '../ui/theme';
import { WorkspaceProvider, useWorkspace } from './context';
import { bottomLabel, bottomSections, isBottomSection, moreSections, sectionLabel, type Section } from './navigation';
import { Action, ErrorNotice, Loading, ws } from './ui';

const navIcons = {
  assistant: { android: 'smart_toy', ios: 'bubble.left' },
  transactions: { android: 'receipt_long', ios: 'list.bullet.rectangle' },
  dashboard: { android: 'dashboard', ios: 'square.grid.2x2' },
  more: { android: 'more_horiz', ios: 'ellipsis' },
} as const satisfies Record<string, SymbolViewProps['name']>;

function NavItem({ title, icon, selected, hideLabel, onPress, testID, expanded }: { title: string; icon: SymbolViewProps['name']; selected: boolean; hideLabel: boolean; onPress: () => void; testID: string; expanded?: boolean }) {
  return <Pressable accessibilityRole="tab" accessibilityLabel={title} accessibilityState={{ selected, expanded }} testID={testID} onPress={onPress}
    style={({ pressed }) => [chrome.navItem, selected && chrome.navItemActive, pressed && chrome.pressed]}>
    <SymbolView name={icon} size={22} tintColor={selected ? 'white' : colors.muted} />
    {!hideLabel ? <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.25} style={[chrome.navLabel, selected && chrome.navLabelActive]}>{title}</Text> : null}
  </Pressable>;
}

function BottomSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    <View style={ws.scrim}>
      <Pressable style={StyleSheet.absoluteFill} accessible={false} importantForAccessibility="no" onPress={onClose} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={chrome.sheet} accessibilityViewIsModal>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={ws.content} keyboardShouldPersistTaps="handled">
          <View style={chrome.sheetHandle} importantForAccessibility="no" />
          <View style={ws.row}><Text accessibilityRole="header" style={ws.heading}>{title}</Text><Action title="Close" label={`Close ${title.toLowerCase()}`} onPress={onClose} /></View>
          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}

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
  const [householdMenu, setHouseholdMenu] = useState(false);
  const body = useRef<ComponentRef<typeof View>>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [policy, setPolicy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  function navigate(section: Section) { setMenu(false); Keyboard.dismiss(); router.navigate(`/(tabs)/${section}`); }
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
  const blocked = section.blocked && !households && active !== 'assistant';
  return <SafeAreaView edges={keyboardOpen ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']} style={ws.fill}>
    <AndroidKeyboardFrame style={ws.fill}>
    <View style={chrome.header}>
      <Image source={require('../../assets/spndrr-mark.png')} style={chrome.brand} resizeMode="contain" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={chrome.title}>{sectionLabel(active)}</Text>
      {households && households.households.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`Household, ${selected?.name ?? 'select household'}, ${selected?.canWrite ? 'can write' : 'read only'}`} accessibilityHint="Opens household switcher" accessibilityState={{ expanded: householdMenu }} testID="household-switcher" style={({ pressed }) => [chrome.household, pressed && chrome.pressed]} onPress={() => setHouseholdMenu(true)}>
        <View style={chrome.householdLabel}><Text numberOfLines={1} style={chrome.householdName}>{selected?.name ?? 'Household'}</Text><Text numberOfLines={1} style={ws.small}>{selected?.canWrite ? 'Can write' : 'Read only'}</Text></View>
        <SymbolView name={{ android: 'expand_more', ios: 'chevron.down' }} size={16} tintColor={colors.muted} />
      </Pressable> : null}
    </View>
    <SectionBanner banner={banner} />
    <WorkspaceBannerVisible.Provider value={!!banner}><View ref={body} style={ws.fill} onLayout={() => body.current?.measureInWindow((_x, y) => setKeyboardOffset(y))}>
      <KeyboardAvoidingView style={ws.fill} behavior={Platform.OS === 'ios' && active !== 'assistant' ? 'padding' : undefined} keyboardVerticalOffset={keyboardOffset}>
        {/* Tabs keeps visited screens mounted. Keep the navigator mounted even if a section is temporarily blocked. */}
        <View style={ws.fill} importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={blocked}>
          <Tabs backBehavior="history" tabBar={() => null} screenOptions={{ headerShown: false, lazy: true, animation: 'fade', sceneStyle: { backgroundColor: colors.background } }} />
        </View>
        {blocked ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}><SectionPanel section={section} /></View> : null}
      </KeyboardAvoidingView>
    </View></WorkspaceBannerVisible.Provider>
    {!keyboardOpen ? <View accessibilityRole="tablist" accessibilityLabel="Quick navigation" style={chrome.nav}>
      {bottomSections.map(section => <NavItem key={section} hideLabel={!showNavLabels(fontScale)} testID={`nav-${section}`} icon={navIcons[section]} title={bottomLabel(section)} selected={!menu && active === section} onPress={() => navigate(section)} />)}
      <NavItem hideLabel={!showNavLabels(fontScale)} icon={navIcons.more} title="More" testID="nav-more" selected={menu || !isBottomSection(active)} expanded={menu} onPress={() => setMenu(true)} />
    </View> : null}
    <BottomSheet visible={menu} title="More" onClose={() => setMenu(false)}>
      {moreSections.map(item => <Action key={item.section} testID={`menu-${item.section}`} title={item.label} selected={active === item.section} onPress={() => navigate(item.section)} />)}
      <Text style={styles.label}>{session.user.displayName}</Text><Text style={styles.text}>{session.user.email}</Text><Action title="Sign out" testID="menu-sign-out" onPress={signOut} />
    </BottomSheet>
    <BottomSheet visible={householdMenu} title="Household" onClose={() => setHouseholdMenu(false)}>
      {households?.households.map(h => <Action key={h.id} title={`${h.name} (${h.kind})`} label={`${h.name}, ${h.kind}, ${h.canWrite ? 'can write' : 'read only'}`} selected={h.id === householdId} onPress={() => { setHouseholdId(h.id); setHouseholdMenu(false); }} />)}
    </BottomSheet>
    </AndroidKeyboardFrame>
  </SafeAreaView>;
}
export function WorkspaceShell() { const { session } = useSession(); return <SectionsProvider key={session?.user.id}><WorkspaceProvider><Shell /></WorkspaceProvider></SectionsProvider>; }

const chrome = StyleSheet.create({
  header: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'white', borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { width: 28, height: 28, flexShrink: 0 },
  title: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 20, fontWeight: '700', textAlign: 'left' },
  household: { maxWidth: '45%', minWidth: 48, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderRadius: 12, backgroundColor: colors.surface },
  householdLabel: { flexShrink: 1, minWidth: 0 },
  householdName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 4, backgroundColor: 'white', borderTopWidth: 1, borderColor: colors.border },
  navItem: { flex: 1, minWidth: 48, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 3, paddingVertical: 6 },
  navItemActive: { backgroundColor: colors.accent },
  navLabel: { width: '100%', fontSize: 11, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  navLabelActive: { color: 'white' },
  pressed: { opacity: 0.7 },
  sheet: { maxHeight: '90%', backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
});
