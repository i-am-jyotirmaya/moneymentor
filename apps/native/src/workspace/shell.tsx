import { WorkspaceBannerVisible } from './banner';
import { SectionsProvider, SectionBanner, SectionPanel, useSectionBanner } from './sections';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import type { SymbolViewProps } from 'expo-symbols';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../auth/session';
import { AndroidKeyboardFrame } from '../ui/AndroidKeyboardFrame';
import { PrivacyPolicySheet } from '../ui/PrivacyPolicySheet';
import { HouseholdSheet } from '../ui/HouseholdSheet';
import { MoreSheet } from '../ui/MoreSheet';
import { Sheet } from '../ui/Sheet';
import { useLegacy } from './legacy-styles';
import { householdSheetRows, moreSheetItems } from './more-data';
import { WorkspaceProvider, useWorkspace } from './context';
import { bottomLabel, bottomSections, sectionLabel, sections, type DockRoute, type Section } from './navigation';
import { NavDock, type NavDockRoute } from './NavDock';
import { TopBar } from './TopBar';
import { Action, ErrorNotice, Loading } from './ui';
import { useTheme } from '../ui/ThemeProvider';
import { formatMonthKey, getMonthOptions } from '../lib/format';
import { DOCK_SPACE } from './dock';

const navIcons = {
  assistant: { android: 'smart_toy', ios: 'bubble.left' },
  transactions: { android: 'receipt_long', ios: 'list.bullet.rectangle' },
  dashboard: { android: 'dashboard', ios: 'square.grid.2x2' },
  more: { android: 'more_horiz', ios: 'ellipsis' },
} as const satisfies Record<string, SymbolViewProps['name']>;
const dockRoutes: readonly NavDockRoute[] = [
  ...bottomSections.map(section => ({ key: section, label: bottomLabel(section), icon: navIcons[section] })),
  { key: 'more', label: 'More', icon: navIcons.more },
];

// expo-dev-client only exists in dev builds; require it lazily so release bundles never touch it.
function devClient(): { openMenu(): void; setToolsButtonVisible(visible: boolean): void } | null {
  if (!__DEV__) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dev-only native module
  try { return require('expo-dev-client'); } catch { return null; }
}

function Shell() {
  const { ws, styles } = useLegacy();
  const { client, session, status } = useSession();
  const { households, householdId, setHouseholdId, section, month, setMonth, settings } = useWorkspace();
  const [keyboardOpen, setKeyboardOpen] = useState(Keyboard.isVisible());
  const shell = useTheme();
  // The revamp replaces the dev-client floating gear with a long press on the mark (and Settings → Developer).
  useEffect(() => { try { devClient()?.setToolsButtonVisible(false); } catch { /* older dev client */ } }, []);
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
  const [monthMenu, setMonthMenu] = useState(false);
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
  function pressDock(key: DockRoute) { if (key === 'more') setMenu(true); else navigate(key); }
  return <SafeAreaView edges={keyboardOpen ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']} style={[ws.fill, { backgroundColor: shell.color.bg }]}>
    <AndroidKeyboardFrame style={ws.fill}>
    <TopBar title={sectionLabel(active)}
      household={households && households.households.length > 0 ? { name: selected?.name ?? 'Select household', canWrite: !!selected?.canWrite } : null}
      onHouseholdPress={() => setHouseholdMenu(true)} householdExpanded={householdMenu}
      action={active === 'dashboard' ? { icon: { android: 'calendar_month', ios: 'calendar' }, label: `Choose month, ${formatMonthKey(month)}`, onPress: () => setMonthMenu(true) } : undefined}
      onMarkLongPress={__DEV__ ? () => devClient()?.openMenu() : undefined} />
    <SectionBanner banner={banner} />
    <WorkspaceBannerVisible.Provider value={!!banner}><View ref={body} style={ws.fill} onLayout={() => body.current?.measureInWindow((_x, y) => setKeyboardOffset(y))}>
      <KeyboardAvoidingView style={ws.fill} behavior={Platform.OS === 'ios' && active !== 'assistant' ? 'padding' : undefined} keyboardVerticalOffset={keyboardOffset}>
        {/* Tabs keeps visited screens mounted. Keep the navigator mounted even if a section is temporarily blocked. */}
        <View style={ws.fill} importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={blocked}>
          <Tabs backBehavior="initialRoute" tabBar={() => null} screenOptions={{ headerShown: false, lazy: true, animation: 'fade', sceneStyle: { backgroundColor: shell.color.bg } }}>
            {/* Each screen reserves useDockSpace() in its content or scroll viewport. */}
            {sections.map(({ section }) => <Tabs.Screen key={section} name={section} />)}
          </Tabs>
        </View>
        {blocked ? <View style={[StyleSheet.absoluteFill, { backgroundColor: shell.color.bg, paddingBottom: DOCK_SPACE }]}><SectionPanel section={section} /></View> : null}
      </KeyboardAvoidingView>
    </View></WorkspaceBannerVisible.Provider>
    {/* Rendered by the shell rather than Tabs' tabBar so it stays reachable over a blocked-section overlay. */}
    {/* The dock floats over the scene; screens reserve DOCK_SPACE so their last controls remain reachable. */}
    {!keyboardOpen ? <View pointerEvents="box-none" style={chrome.dock}><NavDock routes={dockRoutes} active={active} moreOpen={menu} onPress={pressDock} /></View> : null}
    <Sheet open={menu} onClose={() => setMenu(false)} title="More" testID="more-sheet">
      <MoreSheet user={{ name: session.user.displayName, email: session.user.email, plan: settings?.plan ?? 'Free' }}
        items={moreSheetItems(selected ? { name: selected.name, members: selected.memberCount } : null)}
        onSelect={key => navigate(key as Section)} onSignOut={signOut} />
    </Sheet>
    <Sheet open={monthMenu} onClose={() => setMonthMenu(false)} title="Dashboard month" testID="month-sheet">
      <View style={chrome.sheetBody}>{getMonthOptions(month).map(value => <Action key={value} testID={`month-${value}`} title={formatMonthKey(value)} selected={value === month} onPress={() => { setMonth(value); setMonthMenu(false); }} />)}</View>
    </Sheet>
    <Sheet open={householdMenu} onClose={() => setHouseholdMenu(false)} title="Switch household" testID="household-sheet">
      <HouseholdSheet households={householdSheetRows(households?.households ?? [])} currentId={householdId}
        onSelect={id => { setHouseholdId(id); setHouseholdMenu(false); }}
        onCreate={() => { setHouseholdMenu(false); navigate('household'); }} />
    </Sheet>
    </AndroidKeyboardFrame>
  </SafeAreaView>;
}
export function WorkspaceShell() { const { session } = useSession(); return <SectionsProvider key={session?.user.id}><WorkspaceProvider><Shell /></WorkspaceProvider></SectionsProvider>; }

const chrome = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 4 },
});
