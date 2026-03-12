import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "mindtab_access_token";
const REFRESH_TOKEN_KEY = "mindtab_refresh_token";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

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

/**
 * Refresh the access token using the stored refresh token.
 * Returns true if refresh succeeded, false otherwise.
 * On failure, clears all stored tokens.
 */
export async function refreshTokens(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Platform": "mobile",
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (res.ok) {
    const data = await res.json();
    await setAccessToken(data.accessToken);
    await setRefreshToken(data.refreshToken);
    return true;
  }

  await clearTokens();
  return false;
}

export async function emailSignup(email: string, password: string, name: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/email/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
    body: JSON.stringify({ email, password, name }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Signup failed");
  }
}

export async function emailVerify(
  email: string,
  code: string
): Promise<{ accessToken: string; refreshToken: string; user: any }> {
  const res = await fetch(`${API_URL}/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
    body: JSON.stringify({ email, code }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Verification failed");
  }

  return res.json();
}

export async function emailSignin(
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string; user: any }> {
  const res = await fetch(`${API_URL}/auth/email/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Sign in failed");
  }

  return res.json();
}

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/email/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Request failed");
  }
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/email/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
    body: JSON.stringify({ email, code, newPassword }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Password reset failed");
  }
}
