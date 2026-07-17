import createClient from "openapi-fetch";
import type { paths } from "@mindtab/api-spec";

let accessToken: string | null = null;
const baseUrl = import.meta.env.VITE_API_URL || "";

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export const api = createClient<paths>({
  baseUrl,
  credentials: "include",
});

async function refreshAccessToken() {
  const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!refreshRes.ok) return null;
  const data = await refreshRes.json() as { accessToken?: string };
  const token = data.accessToken ?? null;
  setAccessToken(token);
  return token;
}

export async function authedFetch(path: string, init: RequestInit = {}) {
  const run = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  };

  let response = await run(accessToken);
  if (response.status !== 401 || path.startsWith("/auth/")) return response;

  try {
    const token = await refreshAccessToken();
    if (token) response = await run(token);
  } catch {
    setAccessToken(null);
  }
  return response;
}

// Add auth interceptor
api.use({
  async onRequest({ request }) {
    if (accessToken) {
      request.headers.set("Authorization", `Bearer ${accessToken}`);
    }
    return request;
  },

  async onResponse({ request, response }) {
    const url = new URL(request.url, window.location.origin);
    if (response.status === 401 && !url.pathname.startsWith("/auth/")) {
      // Attempt to refresh the token
      try {
        const token = await refreshAccessToken();

        if (token) {

          // Retry the original request with the new token
          const retryRequest = new Request(request, {
            headers: new Headers(request.headers),
          });
          retryRequest.headers.set(
            "Authorization",
            `Bearer ${token}`,
          );
          return fetch(retryRequest);
        }
      } catch {
        // Refresh failed
      }

      // If refresh failed, redirect to login
      setAccessToken(null);
      window.location.href = "/login";
    }
    return response;
  },
});
