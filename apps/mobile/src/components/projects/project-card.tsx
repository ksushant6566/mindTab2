import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Card } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

const statusVariant: Record<string, "secondary" | "warning" | "success" | "outline"> = {
  active: "success",
  planning: "warning",
  completed: "outline",
  on_hold: "secondary",
};

type ProjectCardProps = {
  project: {
    id: string;
    name: string;
    description?: string | null;
    status?: string | null;
  };
};

export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();

  return (
    <Pressable onPress={() => router.push(`/(main)/projects/${project.id}`)}>
      <Card className="mb-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-foreground font-medium flex-1 mr-3" numberOfLines={1}>
            {project.name}
          </Text>
          {project.status && (
            <Badge variant={statusVariant[project.status] ?? "secondary"}>
              {project.status.replace("_", " ")}
            </Badge>
          )}
        </View>
        {project.description && (
          <Text className="text-muted-foreground text-sm mt-1" numberOfLines={2}>
            {project.description}
          </Text>
        )}
      </Card>
    </Pressable>
  );
}
