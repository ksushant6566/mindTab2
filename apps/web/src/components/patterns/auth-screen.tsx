import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon, ChevronRight, MailIcon } from "lucide-react";
import { useAuth } from "~/api/hooks/use-auth";
import { Inline, Stack, Surface } from "~/components/layout";
import { ErrorState } from "~/components/patterns";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Heading, MetaText, Text } from "~/components/ui/typography";

const AUTH_CHANNEL_NAME = "mindtab-auth";
const AUTH_COMPLETE_MESSAGE = "mindtab:auth-complete";

type AuthMode = "signin" | "signup" | "verify";

type AuthCompleteMessage = {
  type: typeof AUTH_COMPLETE_MESSAGE;
  session: Parameters<ReturnType<typeof useAuth>["setSession"]>[0];
};

function buildGoogleAuthURL() {
  const apiBaseURL = import.meta.env.VITE_API_URL || window.location.origin;
  const authURL = new URL("/auth/google/start", apiBaseURL);
  authURL.searchParams.set(
    "return_to",
    new URL("/oauth/google/callback", window.location.origin).toString(),
  );
  return authURL.toString();
}

export default function Auth() {
  const { setSession, emailSignin, emailSignup, emailVerify } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningInWithGoogle, setIsSigningInWithGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "signup" ? "Create your account" : mode === "verify" ? "Verify your email" : "Sign in";
  const submitLabel = mode === "signup" ? "Create account" : mode === "verify" ? "Verify email" : "Sign in with email";

  const description = useMemo(() => {
    if (mode === "verify") {
      return `Enter the 6-digit code sent to ${email || "your email"}.`;
    }
    if (mode === "signup") {
      return "Use email credentials for web and e2e-friendly local testing.";
    }
    return "Continue with your MindTab workspace.";
  }, [email, mode]);

  const completeSignIn = useCallback((message: AuthCompleteMessage) => {
    setSession(message.session);
    void navigate({ to: "/" });
  }, [navigate, setSession]);

  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === AUTH_COMPLETE_MESSAGE) {
        completeSignIn(event.data as AuthCompleteMessage);
      }
    };

    const channel = "BroadcastChannel" in window
      ? new BroadcastChannel(AUTH_CHANNEL_NAME)
      : null;

    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.type === AUTH_COMPLETE_MESSAGE) {
          completeSignIn(event.data as AuthCompleteMessage);
        }
      };
    }

    window.addEventListener("message", handleWindowMessage);
    return () => {
      window.removeEventListener("message", handleWindowMessage);
      channel?.close();
    };
  }, [completeSignIn]);

  const handleGoogleSignIn = useCallback(() => {
    setIsSigningInWithGoogle(true);
    const authWindow = window.open(buildGoogleAuthURL(), "_blank");

    if (!authWindow) {
      window.location.href = buildGoogleAuthURL();
      return;
    }

    window.setTimeout(() => setIsSigningInWithGoogle(false), 1500);
  }, []);

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const normalizedEmail = email.trim();
      if (mode === "signup") {
        await emailSignup(normalizedEmail, password, name.trim());
        setMode("verify");
        return;
      }

      if (mode === "verify") {
        await emailVerify(normalizedEmail, code.trim());
        void navigate({ to: "/" });
        return;
      }

      await emailSignin(normalizedEmail, password);
      void navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen w-screen items-center justify-center bg-background px-6 py-10">
      <Stack gap="xl" className="w-full max-w-4xl items-center">
        <Stack gap="md" className="items-center text-center">
          <Heading variant="page" className="text-4xl sm:text-6xl">
            Welcome to MindTab
          </Heading>
          <Text variant="muted" className="max-w-2xl text-[length:var(--type-title-size)] leading-[1.55]">
            Manage projects, plan your calendar, chat with your workspace, and keep saved material in one place.
          </Text>
        </Stack>

        <Surface variant="elevated" className="w-full max-w-md p-5">
          <Stack gap="lg">
            <Stack gap="xs">
              <Heading variant="section">{title}</Heading>
              <Text variant="muted">{description}</Text>
            </Stack>

            {error ? <ErrorState title="Authentication failed" description={error} /> : null}

            <form onSubmit={handleEmailSubmit}>
              <Stack gap="md">
                {mode === "signup" ? (
                  <Stack gap="xs">
                    <Label htmlFor="auth-name">Name</Label>
                    <Input
                      id="auth-name"
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                    />
                  </Stack>
                ) : null}

                <Stack gap="xs">
                  <Label htmlFor="auth-email">Email</Label>
                  <Input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    disabled={mode === "verify"}
                  />
                </Stack>

                {mode === "verify" ? (
                  <Stack gap="xs">
                    <Label htmlFor="auth-code">Verification code</Label>
                    <Input
                      id="auth-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      required
                    />
                  </Stack>
                ) : (
                  <Stack gap="xs">
                    <Label htmlFor="auth-password">Password</Label>
                    <Input
                      id="auth-password"
                      type="password"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      minLength={8}
                      required
                    />
                  </Stack>
                )}

                <Button type="submit" loading={isSubmitting} className="w-full">
                  <MailIcon className="mr-2 h-4 w-4" />
                  {submitLabel}
                </Button>
              </Stack>
            </form>

            <Inline className="justify-center">
              <MetaText>
                {mode === "signin" ? "New here?" : "Already have an account?"}
              </MetaText>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => {
                  setError(null);
                  setMode(mode === "signin" ? "signup" : "signin");
                }}
              >
                {mode === "signin" ? "Create account" : "Sign in"}
              </Button>
            </Inline>

            <div className="h-px bg-border" />

            <Button type="button" variant="secondary" onClick={handleGoogleSignIn} disabled={isSigningInWithGoogle} className="w-full">
              <GoogleIcon />
              {isSigningInWithGoogle ? "Signing in..." : "Continue with Google"}
            </Button>
          </Stack>
        </Surface>

        <Inline className="justify-center">
          <Button variant="secondary" asChild>
            <a
              href="https://chromewebstore.google.com/detail/mindtab/ndnegdefonikfckhbgmejdodebnbhjll"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Chrome Extension
              <span className="inline-flex items-center">
                <ChevronRight className="ml-2 transition-all" size={14} />
                <ArrowRightIcon className="ml-2 hidden transition-all duration-500" width={14} height={14} />
              </span>
            </a>
          </Button>
          <Button variant="secondary" asChild>
            <a
              href="https://github.com/ksushant6566/MindTab"
              target="_blank"
              rel="noopener noreferrer"
            >
              Star MindTab on GitHub
            </a>
          </Button>
        </Inline>
      </Stack>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-5 w-5" viewBox="-3 0 262 262" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid" aria-hidden="true">
      <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4" />
      <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853" />
      <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="#FBBC05" />
      <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335" />
    </svg>
  );
}
