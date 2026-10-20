import Constants from 'expo-constants';
import { Linking } from 'react-native';
import { FinanceClient } from '@spndrr/finance-core';
import { createNativeTransport, scopedVault, validateApiOrigin } from './native-transport';
import { fixtureTransport } from './fixture-transport';
import { qaApiRoute } from './qa-api-routing';
import { clearExportCache } from './share-export';

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
  return { client: new FinanceClient(adapter.transport, adapter.clear), fixture,
    draftVault: (ownerId: string, householdId?: string) => scopedVault(origin, `composer:${ownerId}${householdId ? `:${householdId}` : ''}`),
    planningVault: (ownerId: string) => scopedVault(origin, `planning-runs:${ownerId}`),
    historyVault: (ownerId: string, householdId: string) => scopedVault(origin, `assistant-history:${ownerId}:${householdId}`),
    operationVault: (ownerId: string) => scopedVault(origin, `operations:${ownerId}`) };
}
export type Runtime = Awaited<ReturnType<typeof createRuntime>>;
