import Constants from 'expo-constants';
import { FinanceClient } from '@spndrr/finance-core';
import { createNativeTransport, scopedVault, validateApiOrigin } from './native-transport';
import { fixtureTransport } from './fixture-transport';

export async function createRuntime() {
  const fixture = Constants.expoConfig?.extra?.fixture === true;
  if (fixture && Constants.expoConfig?.extra?.appVariant !== 'e2e') throw Error('Invalid QA build configuration.');
  const origin = fixture ? 'https://e2e.invalid' : validateApiOrigin(process.env.EXPO_PUBLIC_API_URL);
  const adapter = fixture ? fixtureTransport({ pause: milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)) }) : await createNativeTransport(origin);
  return { client: new FinanceClient(adapter.transport, adapter.clear), fixture,
    draftVault: (ownerId: string) => scopedVault(origin, `composer:${ownerId}`),
    operationVault: (ownerId: string) => scopedVault(origin, `operations:${ownerId}`) };
}
export type Runtime = Awaited<ReturnType<typeof createRuntime>>;
