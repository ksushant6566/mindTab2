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
});
