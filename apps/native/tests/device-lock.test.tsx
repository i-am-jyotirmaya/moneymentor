import { authenticateAsync, type LocalAuthenticationResult } from "expo-local-authentication";
import { act, type ReactElement } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { SessionState } from "../src/api/client";
import { DeviceLockProvider, useDeviceLock } from "../src/auth/device-lock";
import { useSession } from "../src/auth/session";
import { getAccessToken } from "../src/auth/token-storage";

jest.mock("expo-local-authentication", () => ({ authenticateAsync: jest.fn() }));
jest.mock("expo-screen-capture", () => ({ enableAppSwitcherProtectionAsync: jest.fn(async () => {}) }));
jest.mock("../src/auth/session", () => ({ useSession: jest.fn() }));
jest.mock("../src/auth/token-storage", () => ({ getAccessToken: jest.fn() }));
jest.mock("../src/ui", () => ({ useTheme: () => ({ color: { bg: "#fff" } }) }));
jest.mock("../src/ui/AuthForm", () => ({ Button: () => null, ErrorBox: () => null }));
jest.mock("../src/ui/Skeleton", () => ({ Skeleton: () => null }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: { children: unknown }) => children }));

const rendererPath = require.resolve("test-renderer", { paths: [require.resolve("jest-expo/package.json")] });
const { createRoot } = jest.requireActual<{
  createRoot: () => { render: (element: ReactElement) => void; unmount: () => void };
}>(rendererPath);

const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
const originalAppState = AppState.currentState;
let root: ReturnType<typeof createRoot>;
let snapshot: SessionState;
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const observed = jest.fn();
const client = {
  getSnapshot: () => snapshot,
  subscribe: () => () => {},
  setDeviceLocked: jest.fn(),
  restore: jest.fn(async () => {
    snapshot = {
      status: "authenticated",
      session: { accessToken: "token", accessTokenExpiresAt: "2099-01-01T00:00:00Z", requiresPrivacyConsent: false,
        user: { id: "user", displayName: "User", email: "user@example.com", roles: [] } },
    };
  }),
};

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

test("signed-out launch skips device authentication", async () => {
  jest.mocked(getAccessToken).mockResolvedValueOnce(null);
  await mount();
  expect(authenticateAsync).not.toHaveBeenCalled();
  expect(observed).toHaveBeenLastCalledWith("open");
});
