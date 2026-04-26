import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "~/lib/api-client";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

type CommitInput = {
  id: string;
  title?: string;
};

type CommitResult = {
  id: string;
  commit_status: "committed";
  [key: string]: unknown;
};

export function useCommitSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: CommitInput): Promise<CommitResult> => {
      const res = await authedFetch(`${API_URL}/saves/${id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(title ? { title } : {}),
      });
      if (!res.ok) throw new Error(`commit status=${res.status}`);
      return res.json() as Promise<CommitResult>;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["saves"] });
      qc.invalidateQueries({ queryKey: ["save", id] });
    },
  });
}
