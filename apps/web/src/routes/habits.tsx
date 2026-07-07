import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/habits",
  component: lazyRouteComponent(() => import("./habits-page"), "HabitsRoutePage"),
});
