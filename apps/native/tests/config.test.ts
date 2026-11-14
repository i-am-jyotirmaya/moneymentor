import Constants from "expo-constants";
import { getApiBaseUrl, validateApiBaseUrl } from "../src/config";

const original = process.env.EXPO_PUBLIC_API_BASE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = original;
});
test("environment takes precedence and trailing slashes are removed", () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = "http://10.0.2.2:7085///";
  expect(getApiBaseUrl()).toBe("http://10.0.2.2:7085");
});
test("Expo extra is the fallback", () => {
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  expect(getApiBaseUrl()).toBe(Constants.expoConfig?.extra?.apiBaseUrl);
});
test.each([undefined, "", "file:///tmp/api", "broken", "https://user:pass@example.com", "https://example.com/?key=value", "https://example.com/#fragment"])("rejects invalid or missing config: %s", value => {
  expect(() => validateApiBaseUrl(value)).toThrow(/EXPO_PUBLIC_API_BASE_URL/);
});
