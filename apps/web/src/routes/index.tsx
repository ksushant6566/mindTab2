import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { normalizeDashboardSearch } from "~/lib/dashboard-navigation";
import { Route as rootRoute } from "./__root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: normalizeDashboardSearch,
  component: lazyRouteComponent(() => import("./index-page"), "IndexPage"),
});
