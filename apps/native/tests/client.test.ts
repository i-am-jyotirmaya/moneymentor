import { createFinanceClient } from "../src/api";
import { clearTokens, getAccessToken, getRefreshToken, setRefreshToken } from "../src/auth/token-storage";

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const session = {
  accessToken: "signed-in-token", accessTokenExpiresAt: "2099-01-01T00:00:00Z", requiresPrivacyConsent: false,
  user: { id: "profile-1", email: "person@example.test", displayName: "Person", roles: [] },
};
const response = (status: number, data: unknown) => ({ status, text: async () => JSON.stringify(data) });
beforeEach(async () => {
  await clearTokens();
  fetchMock.mockReset();
  global.fetch = fetchMock;
});
afterAll(() => { global.fetch = originalFetch; });

test("login publishes authenticated, persists token and request sends bearer", async () => {
  fetchMock.mockResolvedValueOnce(response(200, session)).mockResolvedValueOnce(response(200, { ok: true }));
  const client = createFinanceClient("https://api.example.test");
  const states: string[] = [];
  client.subscribe(() => states.push(client.getSnapshot().status));
  await client.login(" person@example.test ", "placeholder");
  expect(states).toEqual(["loading", "authenticated"]);
  expect(await getAccessToken()).toBe(session.accessToken);
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.test/api/auth/login");
  expect(await client.request("/api/example")).toEqual({ ok: true });
  expect(fetchMock.mock.calls[1][1].headers.get("Authorization")).toBe(`Bearer ${session.accessToken}`);
});
test("401 then failed refresh signs out and clears both tokens", async () => {
  fetchMock.mockResolvedValueOnce(response(200, session))
    .mockResolvedValueOnce(response(401, {})).mockResolvedValueOnce(response(401, {}));
  const client = createFinanceClient("https://api.example.test");
  await client.login("person@example.test", "placeholder");
  await setRefreshToken("m0-storage-only");
  await expect(client.request("/api/example")).rejects.toMatchObject({ status: 401 });
  expect(fetchMock.mock.calls[2][0]).toBe("https://api.example.test/api/auth/refresh");
  expect(client.getSnapshot().status).toBe("signedOut");
  expect(await getAccessToken()).toBeNull();
  expect(await getRefreshToken()).toBeNull();
});
test("logout clears tokens even when the server fails", async () => {
  fetchMock.mockResolvedValueOnce(response(200, session)).mockResolvedValueOnce(response(500, {}));
  const client = createFinanceClient("https://api.example.test");
  await client.login("person@example.test", "placeholder");
  await expect(client.logout()).rejects.toMatchObject({ status: 500 });
  expect(await getAccessToken()).toBeNull();
  expect(client.getSnapshot().status).toBe("signedOut");
});
