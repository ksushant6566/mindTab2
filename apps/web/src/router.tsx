import { createRouter } from "@tanstack/react-router";
import { Route as rootRoute } from "./routes/__root";
import { Route as indexRoute } from "./routes/index";
import { Route as habitsRoute } from "./routes/habits";
import { Route as loginRoute } from "./routes/login";
import { Route as userProfileRoute } from "./routes/users/$userId";
import { Route as googleCallbackRoute } from "./routes/auth/google/callback";

const routeTree = rootRoute.addChildren([
  indexRoute,
  habitsRoute,
  loginRoute,
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
