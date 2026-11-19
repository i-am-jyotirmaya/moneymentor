import { clearTokens, getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from "../src/auth/token-storage";

beforeEach(clearTokens);
test("secure tokens round-trip and clear together", async () => {
  expect(await getAccessToken()).toBeNull();
  expect(await getRefreshToken()).toBeNull();
  await setAccessToken("access");
  await setRefreshToken("refresh");
  expect(await getAccessToken()).toBe("access");
  expect(await getRefreshToken()).toBe("refresh");
  await clearTokens();
  expect(await getAccessToken()).toBeNull();
  expect(await getRefreshToken()).toBeNull();
});
