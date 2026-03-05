import { useState } from "react";
import { Button } from "~/components/ui/button";

export function Onboarding() {
  const [step, setStep] = useState(0);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="mx-auto max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-bold">Welcome to MindTab</h1>
        <p className="text-muted-foreground">
          Let&apos;s get you set up. This will only take a moment.
        </p>
        <div className="flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 w-8 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
        <Button onClick={() => setStep((s) => Math.min(s + 1, 2))}>
          {step < 2 ? "Next" : "Get Started"}
        </Button>
      </div>
    </div>
  );
}
