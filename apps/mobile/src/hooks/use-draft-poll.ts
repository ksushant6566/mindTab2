import { useQuery } from "@tanstack/react-query";
import { authedFetch } from "~/lib/api-client";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

type DraftData = {
  id: string;
  extracted_text?: string | null;
  source_title?: string | null;
  media_url?: string | null;
  processing_status:
    | "deferred"
    | "pending"
    | "processing"
    | "completed"
    | "failed";
  commit_status: "draft" | "committed";
};

export function useDraftPoll(id: string | null, enabled: boolean) {
  return useQuery<DraftData>({
    queryKey: ["save", id],
    enabled: !!id && enabled,
    queryFn: async () => {
      const res = await authedFetch(`${API_URL}/saves/${id}`);
      if (!res.ok) throw new Error(`status=${res.status}`);
      return res.json() as Promise<DraftData>;
    },
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 2000;
      if (data.extracted_text || data.processing_status === "failed")
        return false;
      return 2000;
    },
  });
}
