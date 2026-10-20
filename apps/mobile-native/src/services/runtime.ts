import Constants from 'expo-constants';
import { Linking } from 'react-native';
import { FinanceClient } from '@spndrr/finance-core';
import { createNativeTransport, scopedVault, validateApiOrigin } from './native-transport';
import { fixtureTransport } from './fixture-transport';
import { qaApiRoute } from './qa-api-routing';
import { clearExportCache } from './share-export';
import { ScopeIndex } from './scope-index';

export async function createRuntime() {
  clearExportCache();
  const qa = Constants.expoConfig?.extra?.fixture === true;
  if (qa && Constants.expoConfig?.extra?.appVariant !== 'e2e') throw Error('Invalid QA build configuration.');
  let qaOrigin: string | null = null;
  if (qa) {
    const routeVault = await scopedVault('https://e2e.invalid', 'qa-routing');
    const initialUrl = await Linking.getInitialURL();
    qaOrigin = qaApiRoute(initialUrl ? new URL(initialUrl) : null, await routeVault.get());
    if (qaOrigin) await routeVault.put({ origin: qaOrigin }); else await routeVault.remove();
  }
  const fixture = qa && !qaOrigin;
  const origin = qaOrigin ?? (fixture ? 'https://e2e.invalid' : validateApiOrigin(process.env.EXPO_PUBLIC_API_URL));
  const adapter = fixture ? fixtureTransport({ pause: milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)) }) : await createNativeTransport(origin);
  const indexes = new Map<string, Promise<ScopeIndex>>();
  const indexFor = (ownerId: string) => {
    let index = indexes.get(ownerId);
    if (!index) { index = scopedVault(origin, `device-scopes:${ownerId}`).then(vault => new ScopeIndex(vault, ownerId)); indexes.set(ownerId, index); }
    return index;
  };
  const clearOwnerData = async (ownerId: string) => {
    const index = await indexFor(ownerId); const scopes = await index.list();
    const purposes = [`composer:${ownerId}`, `planning-runs:${ownerId}`, `operations:${ownerId}`,
      ...scopes.flatMap(scope => [`composer:${ownerId}:${scope}`, `assistant-history:${ownerId}:${scope}`])];
    await Promise.all(purposes.map(async purpose => (await scopedVault(origin, purpose)).closeAndRemove()));
    await index.clear(); indexes.delete(ownerId);
  };
  return { client: new FinanceClient(adapter.transport, adapter.clear), fixture,
    draftVault: (ownerId: string, householdId?: string) => scopedVault(origin, `composer:${ownerId}${householdId ? `:${householdId}` : ''}`),
    planningVault: (ownerId: string) => scopedVault(origin, `planning-runs:${ownerId}`),
    historyVault: async (ownerId: string, householdId: string) => { await (await indexFor(ownerId)).register(householdId); return scopedVault(origin, `assistant-history:${ownerId}:${householdId}`); },
    clearOwnerData,
    operationVault: (ownerId: string) => scopedVault(origin, `operations:${ownerId}`) };
}
export type Runtime = Awaited<ReturnType<typeof createRuntime>>;
