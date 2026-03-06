import { FlatList, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { projectsQueryOptions } from "@mindtab/core";
import { api } from "~/lib/api-client";
import { ProjectCard } from "./project-card";
import { EmptyState } from "~/components/ui/empty-state";
import { Loading } from "~/components/ui/loading";
import { FolderOpen } from "lucide-react-native";

type Project = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
};

export function ProjectList() {
  const { data: projects = [], isLoading, isFetching, refetch } = useQuery(projectsQueryOptions(api));

  if (isLoading) return <Loading />;

  if ((projects as Project[]).length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No projects yet"
        description="Create a project to organize your goals and notes."
      />
    );
  }

  return (
    <FlatList
      data={projects as Project[]}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ProjectCard project={item} />}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 }}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#fafafa" />
      }
    />
  );
}
