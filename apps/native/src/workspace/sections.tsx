import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type SetStateAction } from 'react';
import { AppState, Text, View } from 'react-native';
import { useSession } from '../auth/session';
import { styles } from '../ui/theme';
import { bannerPriority, classifyFailure, sectionStatus, type Failure } from './section-state';
import { Action, Loading, ws } from './ui';

type Entry = { data: unknown; loadedAt: number };
type Notice = { failure: Failure | null; cached: boolean; empty: boolean; loadedAt?: number; retry: () => void };
const Context = createContext<{
  cache: Map<string, Entry>; notices: Record<string, Notice>; offline: boolean; revision: number;
  retry: () => void; publish: (name: string, notice: Notice | null) => void;
} | null>(null);
export function SectionsProvider({ children }: { children: ReactNode }) {
  const { client } = useSession();
  const offline = useSyncExternalStore(client.subscribeConnection, client.getOffline, client.getOffline);
  const [revision, setRevision] = useState(0);
  const cache = useRef(new Map<string, Entry>()).current;
  const [notices, setNotices] = useState<Record<string, Notice>>({});
  const retry = useCallback(() => setRevision(n => n + 1), []);
  const publish = useCallback((name: string, notice: Notice | null) => setNotices(current => { const next = { ...current }; if (notice) next[name] = notice; else delete next[name]; return next; }), []);
  const wasOffline = useRef(offline);
  useEffect(() => {
    if (wasOffline.current && !offline) retry();
    wasOffline.current = offline;
    if (!offline) return;
    // Probe using the same reads; no network permission or connectivity dependency needed.
    const timer = setInterval(retry, 15000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') retry(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [offline, retry]);
  return <Context.Provider value={{ cache, notices, offline, revision, retry, publish }}>{children}</Context.Provider>;
}
export function useSections() {
  const value = useContext(Context);
  if (!value) throw new Error('SectionsProvider is required');
  return value;
}
export function useSectionLoad<T>(name: string, key: string, load: () => Promise<T>, empty: (data: T) => boolean = () => false, enabled = true) {
  const { cache, publish, offline, revision } = useSections();
  const loader = useRef(load); loader.current = load;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; entry: Entry | undefined; failure: Failure | null; pending: boolean }>(() => ({ key, entry: cache.get(key), failure: null, pending: true }));
  const entry = result.key === key ? result.entry : cache.get(key);
  const failure = result.key === key ? result.failure : null;
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    let current = true;
    if (!enabled) return;
    setResult({ key, entry: cache.get(key), failure: null, pending: true });
    void loader.current().then(data => {
      if (!current) return;
      const entry = { data, loadedAt: Date.now() }; cache.set(key, entry);
      setResult({ key, entry, failure: null, pending: false });
    }).catch(error => {
      if (current) setResult({ key, entry: cache.get(key), failure: classifyFailure(error), pending: false });
    });
    return () => { current = false; };
  }, [key, attempt, revision, enabled, cache]);
  const data = entry?.data as T | undefined;
  const isEmpty = data !== undefined && empty(data);
  const status = sectionStatus({ pending: result.key !== key || result.pending, hasData: !!entry, empty: isEmpty, failure, offline });
  useEffect(() => { publish(name, { failure, cached: !!entry, empty: isEmpty, loadedAt: entry?.loadedAt, retry }); }, [name, failure, entry, isEmpty, retry, publish]);
  useEffect(() => () => publish(name, null), [name, publish]);
  const setData = useCallback((update: SetStateAction<T>) => {
    const previous = cache.get(key);
    const data = typeof update === 'function' ? (update as (value: T) => T)(previous?.data as T) : update;
    const next = { data, loadedAt: Date.now() }; cache.set(key, next);
    setResult({ key, entry: next, failure: null, pending: false });
  }, [cache, key]);
  return { data, setData, status, failure, retry, loading: !entry && status === 'loading', blocked: (!entry || isEmpty) && (status === 'offline' || status === 'error') };
}
export function SectionPanel({ section }: { section: { status: string; failure: Failure | null; retry: () => void } }) {
  if (section.status === 'loading') return <Loading />;
  return <View style={ws.content} accessibilityRole="alert"><Text style={ws.heading}>{section.status === 'offline' ? "You're offline" : 'Couldn’t load this section'}</Text><Text style={styles.text}>{section.status === 'offline' ? "Spndrr needs a connection to load this. We'll reload as soon as you're back." : section.failure?.message}</Text><Action title="Try again" onPress={section.retry} filled /></View>;
}
export function useSectionBanner(active: string) {
  const { notices, offline, retry } = useSections();
  const notice = notices[active === 'dashboard' ? 'workspace' : active];
  const bootstrap = notices.workspace;
  const childFailure = Object.entries(notices).find(([name, value]) => name.startsWith(`${active}:`) && value.failure)?.[1].failure;
  const failure = notice?.failure ?? childFailure ?? bootstrap?.failure;
  const cached = notice?.cached;
  const priority = bannerPriority({ offline, error: !!failure });
  if (!priority || !cached || notice.empty) return null;
  const time = notice.loadedAt ? new Date(notice.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return { text: offline ? `You're offline. Showing what loaded at ${time}.` : "Couldn't refresh. Showing earlier data.", title: offline ? 'Retry' : 'Try again', retry };
}
export function SectionBanner({ banner }: { banner: ReturnType<typeof useSectionBanner> }) {
  return banner ? <View style={ws.card} accessibilityRole="alert"><Text style={styles.text}>{banner.text}</Text><Action title={banner.title} onPress={banner.retry} /></View> : null;
}
