import * as React from "react";
import { SendHorizonal } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Heading, MetaText, Text } from "~/components/ui/typography";
import { Inline, Stack, Surface } from "~/components/layout";
import { EmptyState } from "~/components/patterns";
import { cn } from "~/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function ChatPanel({ className, ...props }: DivProps) {
  return <div className={cn("flex min-h-0 flex-1 flex-col bg-background text-foreground", className)} {...props} />;
}

export function ChatMessageBubble({
  role,
  children,
  meta,
  className,
}: {
  role: "user" | "assistant" | "system";
  children: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start", className)}>
      <Surface variant={isUser ? "elevated" : "soft"} className={cn("max-w-[min(720px,85%)] px-4 py-3", isUser && "bg-primary text-primary-foreground")}>
        <Stack gap="xs">
          {meta ? <MetaText className={isUser ? "text-primary-foreground/70" : undefined}>{meta}</MetaText> : null}
          <Text as="div" className={isUser ? "text-primary-foreground" : undefined}>{children}</Text>
        </Stack>
      </Surface>
    </div>
  );
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "Message MindTab",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Surface variant="elevated" className={cn("p-2", className)}>
      <Inline align="end" gap="sm">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <Button type="button" size="icon" onClick={onSubmit} disabled={disabled || !value.trim()}>
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </Inline>
    </Surface>
  );
}

export function ChatEmptyState({ title = "Start a conversation", description }: { title?: React.ReactNode; description?: React.ReactNode }) {
  return <EmptyState title={title} description={description} />;
}

export function ChatConversationTitle({ title, meta }: { title: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <Stack gap="xs">
      <Heading variant="section" className="truncate">{title}</Heading>
      {meta ? <MetaText>{meta}</MetaText> : null}
    </Stack>
  );
}
