import { createRootRoute, Outlet } from "@tanstack/react-router";
import { WorkstationNavigationProvider } from "~/lib/workstation-navigation";
import { WebChatProvider } from "~/lib/web-chat";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <WorkstationNavigationProvider>
      <WebChatProvider>
        <Outlet />
      </WebChatProvider>
    </WorkstationNavigationProvider>
  );
}
