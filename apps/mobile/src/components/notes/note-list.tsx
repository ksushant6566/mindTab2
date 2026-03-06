import { FlatList, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { journalsQueryOptions } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { NoteCard } from "./note-card";
import { EmptyState } from "~/components/ui/empty-state";
import { Loading } from "~/components/ui/loading";
import { FileEdit } from "lucide-react-native";

type Note = {
  id: string;
  title: string;
  content?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export function NoteList() {
  const { data: notes = [], isLoading, isFetching, refetch } = useQuery(journalsQueryOptions(api));

  if (isLoading) return <Loading />;

  if ((notes as Note[]).length === 0) {
    return (
      <EmptyState
        icon={FileEdit}
        title="No notes yet"
        description="Create your first note to start capturing thoughts."
      />
    );
  }

  return (
    <FlatList
      data={notes as Note[]}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <NoteCard note={item} />}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 }}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#fafafa" />
      }
    />
  );
}
