import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as rootRoute } from "../__root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users/$userId",
  component: lazyRouteComponent(
    () => import("./user-profile-page"),
    "UserProfilePage"
  ),
});
