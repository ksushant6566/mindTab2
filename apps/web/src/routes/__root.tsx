import { createRootRoute, Outlet } from "@tanstack/react-router";
import { WorkstationNavigationProvider } from "~/lib/workstation-navigation";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <WorkstationNavigationProvider>
      <Outlet />
    </WorkstationNavigationProvider>
  );
}
