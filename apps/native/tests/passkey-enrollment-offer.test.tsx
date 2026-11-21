import * as SecureStore from "expo-secure-store";
import { useNavigation, useRouter } from "expo-router";
import { act, type ReactElement } from "react";
import Login from "../app/(auth)/login";
import type { FinanceClient } from "../src/api/client";
import { PasskeyEnrollmentOffer } from "../src/auth/passkey-enrollment-offer";
import { getPasskeyCredential, supportsPasskeys } from "../src/auth/passkeys";
import { useSession } from "../src/auth/session";
import { Button, Field } from "../src/ui/AuthForm";
import { AuthMethodTiles } from "../src/ui/AuthMethodTiles";

jest.mock("expo-router", () => ({ useNavigation: jest.fn(), useRouter: jest.fn() }));
jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock("../src/auth/passkeys", () => ({ getPasskeyCredential: jest.fn(), supportsPasskeys: jest.fn() }));
jest.mock("../src/auth/session", () => ({ useSession: jest.fn() }));
jest.mock("../src/ui/AuthForm", () => ({
  Button: jest.fn(() => null), Field: jest.fn(() => null), AuthLink: () => null, ErrorBox: () => null, LoginFooter: () => null,
}));
jest.mock("../src/ui/AuthFrame", () => ({ AuthFrame: ({ children }: { children: unknown }) => children }));
jest.mock("../src/ui/AuthMethodTiles", () => ({ AuthMethodTiles: jest.fn(() => null) }));
jest.mock("../src/ui/AndroidKeyboardFrame", () => ({ AndroidKeyboardFrame: ({ children }: { children: unknown }) => children }));
jest.mock("../src/ui/Icon", () => ({ Icon: () => null }));
jest.mock("../src/ui/PrivacyPolicySheet", () => ({ PrivacyPolicySheet: () => null }));
jest.mock("../src/ui/Text", () => ({ Text: () => null }));
jest.mock("../src/ui/ThemeProvider", () => ({ useTheme: () => ({ color: { bg: "#fff" } }) }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: { children: unknown }) => children }));

const rendererPath = require.resolve("test-renderer", { paths: [require.resolve("jest-expo/package.json")] });
const { createRoot } = jest.requireActual<{
  createRoot: () => { render: (element: ReactElement) => void; unmount: () => void };
}>(rendererPath);

const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
const marker = "spndrr.passkey-offer.user-1";
const session = { user: { id: "user-1" } };
const setPasskeyOfferAccountId = jest.fn();
const client = {
  listPasskeys: jest.fn<ReturnType<FinanceClient["listPasskeys"]>, []>(),
  registerPasskey: jest.fn<ReturnType<FinanceClient["registerPasskey"]>, Parameters<FinanceClient["registerPasskey"]>>(),
  loginWithPasskey: jest.fn(),
};
let root: ReturnType<typeof createRoot>;

function mockAccount(passkeyOfferAccountId: string | null) {
  jest.mocked(useSession).mockReturnValue({ client, passkeyOfferAccountId, session, setPasskeyOfferAccountId } as unknown as ReturnType<typeof useSession>);
}

async function render(enabled = true) {
  await act(async () => { root.render(<PasskeyEnrollmentOffer enabled={enabled}>{null}</PasskeyEnrollmentOffer>); });
}

function button(title: string) {
  return jest.mocked(Button).mock.calls.findLast(([props]) => props.title === title)?.[0];
}

async function tap(title: string) {
  const control = button(title);
  if (!control || control.disabled) throw new Error(`Button unavailable: ${title}`);
  await act(async () => { control.onPress(); });
}

beforeEach(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks();
  root = createRoot();
  mockAccount("user-1");
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  jest.mocked(supportsPasskeys).mockReturnValue(true);
  client.listPasskeys.mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  environment.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});

test("first sign-in waits until the workspace is available and remembers Later for that account", async () => {
  await render(false);
  expect(client.listPasskeys).not.toHaveBeenCalled();
  await render();
  expect(button("Set up passkey")).toBeDefined();
  expect(Field).not.toHaveBeenCalled();
  await tap("Later");
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(marker, "seen");
  expect(client.registerPasskey).not.toHaveBeenCalled();

  await act(async () => { root.unmount(); });
  root = createRoot();
  jest.mocked(Button).mockClear();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue("seen");
  await render();
  expect(client.listPasskeys).toHaveBeenCalledTimes(1);
  expect(button("Set up passkey")).toBeUndefined();
});

test("the offer skips restored sessions, unsupported devices and accounts with a passkey", async () => {
  mockAccount(null);
  await render();
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  mockAccount("user-1");
  jest.mocked(supportsPasskeys).mockReturnValue(false);
  await render(false);
  await render();
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  jest.mocked(supportsPasskeys).mockReturnValue(true);
  client.listPasskeys.mockResolvedValue([{ id: "existing", createdAt: "2026-11-21" }]);
  await render(false);
  await render();
  expect(client.listPasskeys).toHaveBeenCalledTimes(1);
  expect(button("Set up passkey")).toBeUndefined();
});

test("setup confirms the password and keeps Later available if the system picker is canceled", async () => {
  const options = { challenge: "test" };
  jest.mocked(getPasskeyCredential).mockResolvedValueOnce(null).mockResolvedValueOnce({ clientExtensionResults: {} });
  client.registerPasskey.mockImplementation(async (_password, pickCredential) => !!await pickCredential(options));
  await render();
  await tap("Set up passkey");
  expect(client.registerPasskey).not.toHaveBeenCalled();

  async function confirm() {
    const field = jest.mocked(Field).mock.lastCall?.[0];
    await act(async () => { field?.onChangeText?.("current-password"); });
    await tap("Create passkey");
  }

  await confirm();
  expect(client.registerPasskey).toHaveBeenLastCalledWith("current-password", expect.any(Function));
  expect(getPasskeyCredential).toHaveBeenCalledWith("create", options);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(button("Later")?.disabled).toBe(false);

  await confirm();
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(marker, "seen");
});

test("the redesigned login's passkey tile signs in with the system picker and leaves email available on cancellation", async () => {
  const replace = jest.fn();
  const navigate = jest.fn();
  const options = { challenge: "sign-in" };
  jest.mocked(useRouter).mockReturnValue({ replace, navigate } as unknown as ReturnType<typeof useRouter>);
  jest.mocked(useNavigation).mockReturnValue({ isFocused: () => true } as ReturnType<typeof useNavigation>);
  const credential = { clientExtensionResults: {} };
  jest.mocked(getPasskeyCredential).mockResolvedValueOnce(null).mockResolvedValueOnce(credential);
  client.loginWithPasskey.mockImplementation(async (pickCredential: Parameters<FinanceClient["loginWithPasskey"]>[0]) =>
    await pickCredential(options) ? session : null);

  await act(async () => { root.render(<Login />); });
  const methods = jest.mocked(AuthMethodTiles).mock.lastCall?.[0];
  expect(methods?.passkeyAvailable).toBe(true);
  await act(async () => { methods?.onPasskey(); });
  expect(getPasskeyCredential).toHaveBeenCalledWith("get", options);
  expect(replace).not.toHaveBeenCalled();
  await act(async () => { methods?.onEmail(); });
  expect(navigate).toHaveBeenCalledWith("/(auth)/login-email");

  await act(async () => { methods?.onPasskey(); });
  expect(setPasskeyOfferAccountId).toHaveBeenCalledWith(null);
  expect(replace).toHaveBeenCalledWith("/(tabs)/assistant");
});
