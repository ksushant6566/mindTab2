import { useEffect, useState } from "react";
import { createRoute, useNavigate } from "@tanstack/react-router";
import { Route as rootRoute } from "../../__root";
import { useAuth } from "~/api/hooks/use-auth";

const AUTH_CHANNEL_NAME = "mindtab-auth";
const AUTH_COMPLETE_MESSAGE = "mindtab:auth-complete";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/google/callback",
  component: GoogleCallbackPage,
});

function GoogleCallbackPage() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing sign in...");

  useEffect(() => {
    let cancelled = false;

    async function finishSignIn() {
      const params = new URLSearchParams(window.location.search);
      const error = params.get("error");
      if (error) {
        setMessage("Sign in failed. You can close this tab and try again.");
        return;
      }

      const session = await refreshSession();
      if (cancelled) return;

      if (!session) {
        setMessage("Sign in failed. You can close this tab and try again.");
        return;
      }

      const authMessage = {
        type: AUTH_COMPLETE_MESSAGE,
        session,
      };

      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
        channel.postMessage(authMessage);
        channel.close();
      }

      window.opener?.postMessage(authMessage, window.location.origin);
      setMessage("Signed in. Returning to MindTab...");

      window.setTimeout(() => {
        window.close();
        void navigate({ to: "/" });
      }, 500);
    }

    void finishSignIn();
    return () => {
      cancelled = true;
    };
  }, [navigate, refreshSession]);

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
