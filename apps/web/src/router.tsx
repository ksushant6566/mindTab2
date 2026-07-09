import { createRouter } from "@tanstack/react-router";
import { Route as rootRoute } from "./routes/__root";
import { Route as indexRoute } from "./routes/index";
import { Route as loginRoute } from "./routes/login";
import { Route as chatRoute } from "./routes/chat";
import { Route as chatConversationRoute } from "./routes/chat.$conversationId";
import { Route as vaultRoute } from "./routes/vault";
import { Route as vaultDetailRoute } from "./routes/vault.$saveId";
import { Route as settingsRoute } from "./routes/settings";
import { Route as userProfileRoute } from "./routes/users/$userId";
import { Route as googleCallbackRoute } from "./routes/auth/google/callback";

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  chatRoute,
  chatConversationRoute,
  vaultRoute,
  vaultDetailRoute,
  settingsRoute,
  userProfileRoute,
  googleCallbackRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
