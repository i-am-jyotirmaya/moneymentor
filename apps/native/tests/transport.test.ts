import { createTransport } from "../src/api/transport";
import { clearTokens, setAccessToken } from "../src/auth/token-storage";

const fetchMock = jest.fn();
const originalFetch = global.fetch;
beforeEach(async () => {
  await clearTokens();
  fetchMock.mockReset();
  global.fetch = fetchMock;
});
afterAll(() => { global.fetch = originalFetch; });

test("uses base URL, JSON and bearer token from secure storage", async () => {
  await setAccessToken("stored");
  fetchMock.mockResolvedValue({ status: 201, text: async () => '{"ok":true}' });
  const result = await createTransport("https://api.example.test/")({ path: "/api/example", method: "POST", body: { amount: 10 } });
  expect(result).toEqual({ status: 201, data: { ok: true } });
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.example.test/api/example");
  expect(options.headers.get("Authorization")).toBe("Bearer stored");
  expect(options.headers.get("Content-Type")).toBe("application/json");
  expect(options.body).toBe('{"amount":10}');
  expect(options.credentials).toBe("include");
});
test("preserves explicit authorization regardless of header case", async () => {
  await setAccessToken("stored");
  fetchMock.mockResolvedValue({ status: 200, text: async () => '{}' });
  await createTransport("https://api.example.test")({ path: "/api/example", method: "GET", headers: { authorization: "Bearer explicit" } });
  expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer explicit");
});
test.each(["<html>Bad gateway</html>", "", "{broken"])("handles non-JSON or empty responses: %s", async text => {
  fetchMock.mockResolvedValue({ status: 502, text: async () => text });
  expect(await createTransport("https://api.example.test")({ path: "/api/example", method: "GET" })).toEqual({ status: 502, data: null });
  expect(fetchMock.mock.calls[0][1].headers.has("Authorization")).toBe(false);
});
test("does not send tokens to an external URL", async () => {
  await expect(createTransport("https://api.example.test")({ path: "https://other.test/api/example", method: "GET" })).rejects.toThrow("Invalid API path");
  expect(fetchMock).not.toHaveBeenCalled();
});
