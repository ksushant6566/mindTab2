import createClient from "openapi-fetch";
import type { paths } from "@mindtab/api-spec";
import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken, clearTokens } from "./auth";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

export const api = createClient<paths>({ baseUrl: API_URL });

// Mutex for token refresh — prevents concurrent 401s from racing
let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;

  const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Platform": "mobile",
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (refreshRes.ok) {
    const data = await refreshRes.json();
    await setAccessToken(data.accessToken);
    await setRefreshToken(data.refreshToken);
    return true;
  }

  await clearTokens();
  return false;
}

// Store a cloned request before the body is consumed, keyed by URL+method
const pendingRequests = new WeakMap<Request, Request>();

api.use({
  async onRequest({ request }) {
    // Clone before body is consumed so we can retry on 401
    pendingRequests.set(request, request.clone());

    const token = await getAccessToken();
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    request.headers.set("X-Platform", "mobile");
    return request;
  },
  async onResponse({ response, request }) {
    if (response.status === 401 && !request.url.includes("/auth/")) {
      // Use mutex so concurrent 401s share a single refresh
      if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
      }
      const refreshed = await refreshPromise;
      if (!refreshed) return response;

      // Retry with the cloned request (intact body)
      const cloned = pendingRequests.get(request);
      pendingRequests.delete(request);
      if (!cloned) return response;

      const newToken = await getAccessToken();
      cloned.headers.set("Authorization", `Bearer ${newToken}`);
      cloned.headers.set("X-Platform", "mobile");
      return fetch(cloned);
    }
    return response;
  },
});
