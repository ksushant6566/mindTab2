import createClient from "openapi-fetch";
import type { paths } from "@mindtab/api-spec";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL || "",
});

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
        const refreshRes = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/auth/refresh`,
          {
            method: "POST",
            credentials: "include",
          },
        );

        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setAccessToken(data.accessToken);

          // Retry the original request with the new token
          const retryRequest = new Request(request, {
            headers: new Headers(request.headers),
          });
          retryRequest.headers.set(
            "Authorization",
            `Bearer ${data.accessToken}`,
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
