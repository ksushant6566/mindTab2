import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "../__root";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/api/client";
import { activityQueryOptions } from "~/api/hooks";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users/$userId",
  component: UserProfilePage,
});

function UserProfilePage() {
  const { userId } = Route.useParams();

  // Fetch public user data
  const { data: user, isLoading } = useQuery({
    queryKey: ["users", userId],
    queryFn: async () => {
      const { data, error } = await api.GET("/users/{id}", {
        params: { path: { id: userId } },
      });
      if (error) throw error;
      return data;
    },
  });

  const { data: _activity } = useQuery(activityQueryOptions(userId));

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        User not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-4">
          {user.image && (
            <img
              src={user.image}
              alt={user.name ?? ""}
              className="h-16 w-16 rounded-full"
              loading="lazy"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold">{user.name}</h1>
            <p className="text-muted-foreground">{user.xp} XP</p>
          </div>
        </div>
      </div>
    </div>
  );
}
