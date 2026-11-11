import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "spndrr.accessToken";
const REFRESH_TOKEN_KEY = "spndrr.refreshToken";

export const getAccessToken = () => SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
export const setAccessToken = (token: string) => SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
// The API uses an HttpOnly refresh cookie. Native refresh wiring is M1;
// these helpers provide the M0 storage API only.
export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
export const setRefreshToken = (token: string) => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
