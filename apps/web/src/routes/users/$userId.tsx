import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "../__root";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/api/client";
import Profile from "~/components/profile";
import { ProfileSkeleton } from "~/components/profile-skeleton";
import { UserNotFound } from "~/components/user-not-found";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users/$userId",
  component: UserProfilePage,
});

function UserProfilePage() {
  const { userId } = Route.useParams();

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

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (!user) {
    return <UserNotFound userId={userId} />;
  }

  return <Profile userId={userId} user={user as any} />;
}
