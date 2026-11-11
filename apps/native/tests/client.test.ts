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
  const states: string[] = [];
  client.subscribe(() => states.push(client.getSnapshot().status));
  await expect(client.request("/api/example")).rejects.toMatchObject({ status: 401 });
  expect(fetchMock.mock.calls[2][0]).toBe("https://api.example.test/api/auth/refresh");
  expect(client.getSnapshot().status).toBe("signedOut");
  expect(await getAccessToken()).toBeNull();
  expect(await getRefreshToken()).toBeNull();
  expect(states).toContain("signedOut");
});
test("logout clears tokens even when the server fails", async () => {
  fetchMock.mockResolvedValueOnce(response(200, session)).mockResolvedValueOnce(response(500, {}));
  const client = createFinanceClient("https://api.example.test");
  await client.login("person@example.test", "placeholder");
  await setRefreshToken("placeholder-refresh");
  await expect(client.logout()).rejects.toMatchObject({ status: 500 });
  expect(fetchMock.mock.calls[1][0]).toBe("https://api.example.test/api/auth/logout");
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", credentials: "include" });
  expect(await getRefreshToken()).toBeNull();
  expect(await getAccessToken()).toBeNull();
  expect(client.getSnapshot().status).toBe("signedOut");
});

test("401 refreshes once and retries with the renewed token", async () => {
  const renewed = { ...session, accessToken: "renewed-placeholder" };
  fetchMock.mockResolvedValueOnce(response(200, session))
    .mockResolvedValueOnce(response(401, {}))
    .mockResolvedValueOnce(response(200, renewed))
    .mockResolvedValueOnce(response(200, { ok: true }));
  const client = createFinanceClient("https://api.example.test");
  await client.login("person@example.test", "placeholder");
  expect(await client.request("/api/example")).toEqual({ ok: true });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "https://api.example.test/api/auth/login", "https://api.example.test/api/example",
    "https://api.example.test/api/auth/refresh", "https://api.example.test/api/example",
  ]);
  expect(fetchMock.mock.calls[3][1].headers.get("Authorization")).toBe("Bearer renewed-placeholder");
  expect(fetchMock.mock.calls[2][1].credentials).toBe("include");
  expect(await getAccessToken()).toBe(renewed.accessToken);
});

test("a second 401 is returned without another refresh or retry", async () => {
  fetchMock.mockResolvedValueOnce(response(200, session))
    .mockResolvedValueOnce(response(401, {}))
    .mockResolvedValueOnce(response(200, { ...session, accessToken: "renewed-placeholder" }))
    .mockResolvedValueOnce(response(401, {}));
  const client = createFinanceClient("https://api.example.test");
  await client.login("person@example.test", "placeholder");
  await expect(client.request("/api/example")).rejects.toMatchObject({ status: 401 });
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test("concurrent 401s share a single refresh", async () => {
  const renewed = { ...session, accessToken: "renewed-placeholder" };
  let release!: (value: ReturnType<typeof response>) => void;
  const refresh = new Promise<ReturnType<typeof response>>(resolve => { release = resolve; });
  fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
    if (url.endsWith("/login")) return response(200, session);
    if (url.endsWith("/refresh")) return refresh;
    return response(new Headers(options.headers).get("Authorization") === `Bearer ${session.accessToken}` ? 401 : 200, { ok: true });
  });
  const client = createFinanceClient("https://api.example.test");
  await client.login("person@example.test", "placeholder");
  const requests = [client.request("/api/one"), client.request("/api/two")];
  // Hold the refresh response until both requests have received their initial 401.
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/refresh"))).toHaveLength(1);
  release(response(200, renewed));
  expect(await Promise.all(requests)).toEqual([{ ok: true }, { ok: true }]);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/refresh"))).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledTimes(6);
});

test("restore refreshes through the cookie store and persists the access token", async () => {
  fetchMock.mockResolvedValueOnce(response(200, session));
  const client = createFinanceClient("https://api.example.test");
  await client.restore();
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.test/api/auth/refresh");
  expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  expect(client.getSnapshot().status).toBe("authenticated");
  expect(await getAccessToken()).toBe(session.accessToken);
});

test.each([
  { errors: ["First error.", "Second error."] },
  { errors: { Email: ["First error."], Password: ["Second error."] } },
])("ApiError preserves every server error for AuthForm", async data => {
  fetchMock.mockResolvedValueOnce(response(400, data));
  const client = createFinanceClient("https://api.example.test");
  await expect(client.login("person@example.test", "placeholder")).rejects.toMatchObject({
    status: 400, message: "First error. Second error.", errors: ["First error.", "Second error."],
  });
});

test("network failure uses the web connection message", async () => {
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  const client = createFinanceClient("https://api.example.test");
  await expect(client.login("person@example.test", "placeholder")).rejects.toMatchObject({
    errors: ["Could not connect to Spndrr. Please try again in a moment."],
  });
});

test("auth parity sends the web request bodies", async () => {
  fetchMock.mockResolvedValueOnce(response(200, {})).mockResolvedValueOnce(response(200, { name: "Person", email: "person@example.test" }))
    .mockResolvedValueOnce(response(200, session));
  const client = createFinanceClient("https://api.example.test");
  const request = { name: "Person", email: "person@example.test", reason: "Try the beta" };
  await client.requestAccess(request);
  await client.validateInvitation("placeholder-invitation");
  const signup = { invitationToken: "placeholder-invitation", displayName: "Person", email: "person@example.test", password: "placeholder", privacyPolicyVersion: "2026-07-26-ai-planning.1", acceptPrivacyPolicy: true };
  await client.signup(signup);
  expect(fetchMock.mock.calls.map(([url, options]) => [new URL(url).pathname, options.method, JSON.parse(options.body)])).toEqual([
    ["/api/auth/access-requests", "POST", request],
    ["/api/auth/signup-invitations/validate", "POST", { token: "placeholder-invitation" }],
    ["/api/auth/users", "POST", signup],
  ]);
});
