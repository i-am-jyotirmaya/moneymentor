import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "spndrr.accessToken";
const REFRESH_TOKEN_KEY = "spndrr.refreshToken";

export const getAccessToken = () => SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
export const setAccessToken = (token: string) => SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
// Refresh uses the platform HttpOnly cookie store via credentials: include.
// These legacy M0 helpers remain available, but JS never reads/writes the API refresh token.
export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
export const setRefreshToken = (token: string) => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
