import { queryOptions } from "@tanstack/react-query";
import type { components } from "@mindtab/api-spec";
import { api } from "../client";

export type AIProviderConfiguration = components["schemas"]["AIProviderConfiguration"];
export type AIProviderId = components["schemas"]["AIProviderId"];
export type AIModelOption = components["schemas"]["AIModelOption"];

export function aiProvidersQueryOptions() {
  return queryOptions({
    queryKey: ["ai-providers"],
    queryFn: async () => {
      const { data, error } = await api.GET("/ai/providers");
      if (error) throw error;
      return data?.providers ?? [];
    },
  });
}

export async function saveAIProviderCredential(provider: AIProviderId, apiKey: string) {
  const { data, error } = await api.PUT("/ai/providers/{provider}", {
    params: { path: { provider } },
    body: { api_key: apiKey },
  });
  if (error) throw error;
  return data;
}

export async function deleteAIProviderCredential(provider: AIProviderId) {
  const { error } = await api.DELETE("/ai/providers/{provider}", {
    params: { path: { provider } },
  });
  if (error) throw error;
}
