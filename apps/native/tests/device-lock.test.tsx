import { authenticateAsync, type LocalAuthenticationResult } from "expo-local-authentication";
import { act, type ReactElement } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { SessionState } from "../src/api/client";
import { DeviceLockProvider, useDeviceLock } from "../src/auth/device-lock";
import { useSession } from "../src/auth/session";
import { clearTokens, getAccessToken, getDeviceUnlockPreference, setDeviceUnlockPreference } from "../src/auth/token-storage";
import { authenticateWithScreenLock } from "../src/auth/device-credential";
import { Button } from "../src/ui/AuthForm";

jest.mock("expo-local-authentication", () => ({ authenticateAsync: jest.fn() }));
jest.mock("expo-screen-capture", () => ({ enableAppSwitcherProtectionAsync: jest.fn(async () => {}) }));
jest.mock("../src/auth/session", () => ({ useSession: jest.fn() }));
jest.mock("../src/auth/token-storage", () => ({
  clearTokens: jest.fn(async () => {}),
  getAccessToken: jest.fn(),
  getDeviceUnlockPreference: jest.fn(),
  setDeviceUnlockPreference: jest.fn(async () => {}),
}));
jest.mock("../src/auth/device-credential", () => ({ authenticateWithScreenLock: jest.fn() }));
jest.mock("../src/ui", () => ({ Text: () => null, useTheme: () => ({ color: { bg: "#fff" } }) }));
jest.mock("../src/ui/AuthForm", () => ({ Button: jest.fn(() => null), ErrorBox: () => null }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: { children: unknown }) => children }));

const rendererPath = require.resolve("test-renderer", { paths: [require.resolve("jest-expo/package.json")] });
const { createRoot } = jest.requireActual<{
  createRoot: () => {
    render: (element: ReactElement) => void;
    unmount: () => void;
    container: { queryAll: (predicate: (instance: { props: Record<string, unknown> }) => boolean) => unknown[] };
  };
}>(rendererPath);

const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
const originalAppState = AppState.currentState;
let root: ReturnType<typeof createRoot>;
let snapshot: SessionState;
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const observed = jest.fn();
const sessionListeners = new Set<() => void>();
function completeSignIn() {
  snapshot = {
    status: "authenticated",
    session: { accessToken: "token", accessTokenExpiresAt: "2099-01-01T00:00:00Z", requiresPrivacyConsent: false,
      user: { id: "user", displayName: "User", email: "user@example.com", roles: [] } },
  };
  for (const listener of sessionListeners) listener();
}
const client = {
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => {
    sessionListeners.add(listener);
    return () => sessionListeners.delete(listener);
  },
  setDeviceLocked: jest.fn(),
  restore: jest.fn(async () => { completeSignIn(); }),
};

async function tap(title: string) {
  const button = jest.mocked(Button).mock.calls.findLast(([props]) => props.title === title)?.[0];
  if (!button) throw new Error(`Button not rendered: ${title}`);
  await act(async () => { button.onPress(); });
}

function moveAppTo(state: AppStateStatus) {
  AppState.currentState = state;
  for (const listener of appStateListeners) listener(state);
}

function Probe() {
  observed(useDeviceLock());
  return null;
}

async function mount() {
  await act(async () => { root.render(<DeviceLockProvider><Probe /></DeviceLockProvider>); });
}

beforeEach(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  root = createRoot();
  snapshot = { status: "signedOut", session: null };
  AppState.currentState = "active";
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
  jest.mocked(useSession).mockReturnValue({ client } as unknown as ReturnType<typeof useSession>);
  jest.mocked(getAccessToken).mockResolvedValue("saved-token");
  jest.mocked(getDeviceUnlockPreference).mockResolvedValue("biometrics");
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  jest.restoreAllMocks();
  environment.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  AppState.currentState = originalAppState;
});

test("a saved session prompts on launch and again on return from the background", async () => {
  let finishPrompt!: (result: LocalAuthenticationResult) => void;
  jest.mocked(authenticateAsync)
    .mockReturnValueOnce(new Promise(resolve => { finishPrompt = resolve; }))
    .mockResolvedValueOnce({ success: true });
  await mount();
  expect(authenticateAsync).toHaveBeenCalledTimes(1);
  expect(client.restore).not.toHaveBeenCalled();
  expect(observed).toHaveBeenLastCalledWith("locked");

  // The system PIN activity can itself cause a pause and resume.
  await act(async () => { moveAppTo("background"); });
  await act(async () => { moveAppTo("active"); });
  expect(authenticateAsync).toHaveBeenCalledTimes(1);
  await act(async () => { finishPrompt({ success: true }); });
  expect(client.restore).toHaveBeenCalledTimes(1);
  expect(observed).toHaveBeenLastCalledWith("open");

  await act(async () => { moveAppTo("background"); });
  expect(observed).toHaveBeenLastCalledWith("locked");
  expect(authenticateAsync).toHaveBeenCalledTimes(1);
  await act(async () => { moveAppTo("active"); });
  expect(authenticateAsync).toHaveBeenCalledTimes(2);
  expect(client.restore).toHaveBeenCalledTimes(1);
  expect(observed).toHaveBeenLastCalledWith("open");
});

test("canceling automatic authentication keeps the session covered", async () => {
  jest.mocked(authenticateAsync).mockResolvedValueOnce({ success: false, error: "user_cancel" });
  await mount();
  expect(authenticateAsync).toHaveBeenCalledTimes(1);
  expect(client.restore).not.toHaveBeenCalled();
  expect(observed).toHaveBeenLastCalledWith("locked");
});

test("signed-out launch shows the splash until the saved session is checked", async () => {
  let finishCheck!: (token: null) => void;
  jest.mocked(getAccessToken).mockReturnValueOnce(new Promise(resolve => { finishCheck = resolve; }));
  await mount();
  const splash = () => root.container.queryAll(({ props }) => props.testID === "startup-splash");
  expect(splash()).toHaveLength(1);
  expect(observed).toHaveBeenLastCalledWith("checking");

  await act(async () => { finishCheck(null); });
  expect(splash()).toHaveLength(0);
  expect(authenticateAsync).not.toHaveBeenCalled();
  expect(observed).toHaveBeenLastCalledWith("open");
});

test.each([null, "off"] as const)("a saved session with app lock preference %s requires account sign-in", async (preference) => {
  jest.mocked(getDeviceUnlockPreference).mockResolvedValueOnce(preference);
  await mount();
  expect(authenticateAsync).not.toHaveBeenCalled();
  expect(authenticateWithScreenLock).not.toHaveBeenCalled();
  expect(client.restore).not.toHaveBeenCalled();
  expect(clearTokens).toHaveBeenCalledTimes(1);
  expect(observed).toHaveBeenLastCalledWith("open");
});

test.each([
  ["Use screen lock only", "screen-lock", authenticateWithScreenLock, authenticateAsync],
  ["Use biometrics", "biometrics", authenticateAsync, authenticateWithScreenLock],
] as const)("%s selects the system unlock method after separate consent", async (choice, preference, authenticate, unused) => {
  jest.mocked(getAccessToken).mockResolvedValueOnce(null);
  jest.mocked(getDeviceUnlockPreference).mockResolvedValueOnce(null);
  jest.mocked(authenticate).mockResolvedValueOnce({ success: true });
  await mount();
  await act(async () => { completeSignIn(); });
  expect(observed).toHaveBeenLastCalledWith("consent");

  await tap("Use screen lock");
  expect(setDeviceUnlockPreference).not.toHaveBeenCalled();
  expect(authenticateWithScreenLock).not.toHaveBeenCalled();
  expect(authenticateAsync).not.toHaveBeenCalled();

  await tap(choice);
  expect(setDeviceUnlockPreference).toHaveBeenCalledWith(preference);
  await act(async () => { moveAppTo("background"); });
  await act(async () => { moveAppTo("active"); });
  expect(authenticate).toHaveBeenCalledTimes(1);
  expect(unused).not.toHaveBeenCalled();
  expect(observed).toHaveBeenLastCalledWith("open");
});

test("declining app lock keeps the current session open without either device prompt", async () => {
  jest.mocked(getAccessToken).mockResolvedValueOnce(null);
  jest.mocked(getDeviceUnlockPreference).mockResolvedValueOnce(null);
  await mount();
  await act(async () => { completeSignIn(); });
  await tap("Continue without app lock");
  expect(setDeviceUnlockPreference).toHaveBeenCalledWith("off");
  await act(async () => { moveAppTo("background"); });
  await act(async () => { moveAppTo("active"); });
  expect(authenticateWithScreenLock).not.toHaveBeenCalled();
  expect(authenticateAsync).not.toHaveBeenCalled();
  expect(observed).toHaveBeenLastCalledWith("open");
});
