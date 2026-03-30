import * as SecureStore from "expo-secure-store";
import { setSharedToken, removeSharedToken, clearSharedTokens } from "../../modules/shared-keychain";

const ACCESS_TOKEN_KEY = "mindtab_access_token";
const REFRESH_TOKEN_KEY = "mindtab_refresh_token";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

/** Returns true if the JWT's exp claim is within 60s of now or already past. */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 <= Date.now() + 60_000;
  } catch {
    return true;
  }
}

export async function setAccessToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
    await setSharedToken(ACCESS_TOKEN_KEY, token).catch(() => {});
  } else {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await removeSharedToken(ACCESS_TOKEN_KEY).catch(() => {});
  }
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    await setSharedToken(REFRESH_TOKEN_KEY, token).catch(() => {});
  } else {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await removeSharedToken(REFRESH_TOKEN_KEY).catch(() => {});
  }
}

/**
 * Notify the server to invalidate a refresh token.
 * Best-effort — failures are ignored since the client clears tokens regardless.
 * Accepts the token directly to avoid racing with clearTokens().
 */
export async function logoutFromServer(token: string): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Platform": "mobile",
      },
      body: JSON.stringify({ refreshToken: token }),
    });
  } catch {
    // Best-effort — client will clear tokens regardless.
  }
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    clearSharedTokens().catch(() => {}),
  ]);
}

/** Timestamp of last successful refresh — used to skip redundant calls. */
let lastRefreshAt = 0;

/**
 * Refresh the access token using the stored refresh token.
 * Skips if a successful refresh happened within the last 30 seconds.
 * Returns true if refresh succeeded (or was skipped), false otherwise.
 * Only clears tokens on definitive auth rejection (401/403).
 */
export async function refreshTokens(): Promise<boolean> {
  // Skip if we refreshed recently (prevents double-rotation on foreground).
  if (Date.now() - lastRefreshAt < 30_000) return true;

  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Platform": "mobile",
      },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Network error — don't clear tokens, let the user retry.
    return false;
  }

  if (res.ok) {
    const data = await res.json();
    await setAccessToken(data.accessToken);
    await setRefreshToken(data.refreshToken);
    lastRefreshAt = Date.now();
    return true;
  }

  // Only clear tokens on definitive auth rejection.
  if (res.status === 401 || res.status === 403) {
    await clearTokens();
  }

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
