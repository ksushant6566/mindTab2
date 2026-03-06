import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "mindtab_access_token";
const REFRESH_TOKEN_KEY = "mindtab_refresh_token";

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function setAccessToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  }
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  }
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
