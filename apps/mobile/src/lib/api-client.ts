import createClient from "openapi-fetch";
import type { paths } from "@mindtab/api-spec";
import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken, clearTokens } from "./auth";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

export const api = createClient<paths>({ baseUrl: API_URL });

// Add auth interceptor
api.use({
  async onRequest({ request }) {
    const token = await getAccessToken();
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    request.headers.set("X-Platform", "mobile");
    return request;
  },
  async onResponse({ response, request }) {
    if (response.status === 401 && !request.url.includes("/auth/")) {
      // Attempt refresh
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return response;

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

        // Retry original request with new token
        const retryRequest = new Request(request, {
          headers: new Headers(request.headers),
        });
        retryRequest.headers.set("Authorization", `Bearer ${data.accessToken}`);
        return fetch(retryRequest);
      } else {
        // Refresh failed — clear tokens (will trigger login screen)
        await clearTokens();
      }
    }
    return response;
  },
});
