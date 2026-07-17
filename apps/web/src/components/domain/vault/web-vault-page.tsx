import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, authedFetch } from "~/api/client";
import {
  saveQueryOptions,
  savesInfiniteQueryOptions,
  type SaveListItem,
} from "~/api/hooks";
import {
  VaultDetailLoading,
  VaultDetailView,
  VaultGrid,
  VaultLoadMore,
  VaultLoadingGrid,
  VaultNoResults,
  VaultShell,
  VaultToolbar,
  type VaultCreatePayload,
  type VaultFilter,
} from "~/components/domain/vault";
import { ErrorState } from "~/components/patterns";
import { Button } from "~/components/ui/button";

export function WebVaultPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<VaultFilter>("all");
  const [search, setSearch] = useState("");
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
  } = useInfiniteQuery(savesInfiniteQueryOptions());

  const saves = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );
  const filteredSaves = useMemo(() => {
    const query = search.trim().toLowerCase();
    return saves.filter((save) => {
      if (filter !== "all" && save.source_type !== filter) return false;
      if (!query) return true;
      return [
        save.source_title,
        save.source_url,
        save.summary,
        ...save.tags,
        ...save.key_topics,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [filter, saves, search]);

  const createSave = async (payload: VaultCreatePayload) => {
    let saveId: string | undefined;
    if (payload.kind === "url") {
      const { data: created, error: createError } = await api.POST("/saves", {
        body: {
          url: payload.url,
          auto_commit: true,
          start_processing: true,
        },
      });
      if (createError) throw new Error(apiErrorMessage(createError, "Could not save this URL."));
      saveId = created?.id;
    } else {
      const formData = new FormData();
      formData.append(payload.field, payload.file, payload.file.name);
      formData.append("auto_commit", "true");
      formData.append("start_processing", "true");
      if (payload.field === "audio") formData.append("source", "file_picker");

      const response = await authedFetch("/saves", { method: "POST", body: formData });
      const responseBody = await parseResponseBody(response);
      if (!response.ok) {
        throw new Error(apiErrorMessage(responseBody, "Could not upload this file."));
      }
      saveId = (responseBody as { id?: string } | null)?.id;
    }

    await queryClient.invalidateQueries({ queryKey: ["saves"] });
    toast.success("Added to your vault", {
      description: "MindTab is preparing the summary and searchable details.",
    });
    if (saveId) {
      await navigate({ to: "/vault/$saveId", params: { saveId } });
    }
  };

  const toolbar = (
    <VaultToolbar
      total={saves.length}
      visible={filteredSaves.length}
      filter={filter}
      search={search}
      refreshing={isRefetching && !isLoading}
      onFilterChange={setFilter}
      onSearchChange={setSearch}
      onRefresh={() => void refetch()}
      onCreate={createSave}
    />
  );

  return (
    <VaultShell header={toolbar}>
      {isLoading ? (
        <VaultLoadingGrid />
      ) : error ? (
        <ErrorState
          title="Could not load your vault"
          description="Check your connection and try again."
          action={<Button variant="outline" onClick={() => void refetch()}>Try again</Button>}
        />
      ) : filteredSaves.length > 0 ? (
        <>
          <VaultGrid saves={filteredSaves} />
          {hasNextPage ? (
            <VaultLoadMore loading={isFetchingNextPage} onClick={() => void fetchNextPage()} />
          ) : null}
        </>
      ) : (
        <VaultNoResults
          hasSearch={Boolean(search.trim()) || filter !== "all"}
          canLoadMore={hasNextPage}
          loading={isFetchingNextPage}
          onLoadMore={() => void fetchNextPage()}
        />
      )}
    </VaultShell>
  );
}

export function WebVaultDetailPage({ saveId }: { saveId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: save, error, isLoading, refetch } = useQuery(saveQueryOptions(saveId));
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error: deleteError } = await api.DELETE("/saves/{id}", {
        params: { path: { id: saveId } },
      });
      if (deleteError) throw deleteError;
    },
    onSuccess: async () => {
      await navigate({ to: "/vault" });
      await queryClient.invalidateQueries({ queryKey: ["saves", "infinite"] });
      queryClient.removeQueries({ queryKey: ["saves", saveId], exact: true });
      toast.success("Saved item deleted");
    },
    onError: () => toast.error("Could not delete this saved item"),
  });

  if (isLoading) return <VaultDetailLoading />;
  if (error || !save) {
    return (
      <ErrorState
        title="Could not open this saved item"
        description="It may have been deleted, or the request may have failed."
        action={<Button variant="outline" onClick={() => void refetch()}>Try again</Button>}
      />
    );
  }

  return (
    <VaultDetailView
      save={save}
      deleting={deleteMutation.isPending}
      onDelete={() => deleteMutation.mutate()}
    />
  );
}

async function parseResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const record = error as Record<string, unknown>;
  const message = record.message ?? record.error;
  return typeof message === "string" ? message : fallback;
}

export type { SaveListItem };
