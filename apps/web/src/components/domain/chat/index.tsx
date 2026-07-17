import * as React from "react";
import {
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  CornerDownLeftIcon,
  DatabaseIcon,
  DownloadIcon,
  EllipsisIcon,
  FolderKanbanIcon,
  Loader2Icon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  WandSparklesIcon,
  WifiOffIcon,
  WrenchIcon,
} from "lucide-react";
import type { ChatStatus } from "ai";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "~/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "~/components/ai-elements/prompt-input";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "~/components/ai-elements/conversation";
import { Inline, Surface } from "~/components/layout";
import { MetaChip, SkeletonBlock } from "~/components/patterns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Heading, MetaText, Text } from "~/components/ui/typography";
import type { ChatContentPart, ChatToolCall } from "~/lib/web-chat-context";
import { cn } from "~/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;
type ChatConnectionStatus = "connected" | "connecting" | "error";

const TOOL_LABELS: Record<string, string> = {
  compare_periods: "Comparing activity periods",
  create_note: "Creating a note",
  create_project: "Creating a project",
  create_task: "Creating a task",
  delete_note: "Deleting a note",
  delete_task: "Deleting a task",
  get_daily_briefing: "Preparing your daily briefing",
  get_note_content: "Reading note content",
  get_project_stats: "Checking project progress",
  get_stale_items: "Finding neglected work",
  get_task_detail: "Reading task details",
  get_user_profile: "Checking your profile",
  get_vault_item: "Reading a vault item",
  list_notes: "Browsing your notes",
  list_projects: "Browsing your projects",
  list_tasks: "Browsing your tasks",
  search_everything: "Searching your workspace",
  search_notes: "Searching your notes",
  search_tasks: "Searching your tasks",
  search_vault: "Searching your vault",
  update_note: "Updating a note",
  update_project: "Updating a project",
  update_task: "Updating a task",
};

export const CHAT_SUGGESTIONS = [
  {
    label: "Plan my focus",
    description: "Turn today's tasks and signals into a clear priority list.",
    prompt: "Review my workspace and tell me the three most important things to focus on today.",
    icon: WandSparklesIcon,
  },
  {
    label: "Summarize my vault",
    description: "Surface the most useful ideas from what you have saved.",
    prompt: "Summarize the most useful ideas from my recently saved vault items.",
    icon: DatabaseIcon,
  },
  {
    label: "Find something",
    description: "Search tasks, notes, projects, and saved sources.",
    prompt: "Search across my tasks, notes, projects, and vault for what I worked on most recently.",
    icon: SearchIcon,
  },
  {
    label: "Review my week",
    description: "Review progress, risks, and the strongest next move.",
    prompt: "How has my week gone so far? Highlight progress, risks, and the best next action.",
    icon: SparklesIcon,
  },
] as const;

export function ChatPanel({ className, ...props }: DivProps) {
  return (
    <Surface
      variant="transparent"
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-none bg-background text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function ChatConversation({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent
        data-testid="chat-transcript"
        className="mx-auto w-full max-w-4xl gap-10 px-6 pb-10 pt-7"
      >
        {children}
      </ConversationContent>
      <ConversationScrollButton className="bottom-3" />
    </Conversation>
  );
}

export function ChatLoadingTranscript() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-6 py-8">
      <SkeletonBlock className="ml-auto h-16 w-2/3" />
      <SkeletonBlock className="h-28 w-5/6" />
      <SkeletonBlock className="ml-auto h-14 w-1/2" />
      <SkeletonBlock className="h-36 w-4/5" />
    </div>
  );
}

export function ChatConversationActions({
  title,
  transcript,
  deleting,
  onDelete,
}: {
  title: string;
  transcript: string;
  deleting?: boolean;
  onDelete: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const download = React.useCallback(() => {
    const blob = new Blob([transcript], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(title) || "mindtab-conversation"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [title, transcript]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Conversation options"
            className="h-8 w-8 rounded-full text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
          >
            <EllipsisIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={download}>
            <DownloadIcon className="mr-2 h-4 w-4" />
            Download transcript
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2Icon className="mr-2 h-4 w-4" />
            Delete conversation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the conversation and its messages from your chat history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep conversation</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={onDelete}>
              {deleting ? "Deleting…" : "Delete conversation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ChatMessage({
  role,
  parts,
  createdAt,
  isStreaming = false,
}: {
  role: "user" | "assistant";
  parts: ChatContentPart[];
  createdAt?: string;
  isStreaming?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const copiedTimeoutRef = React.useRef<number | null>(null);
  const isAssistant = role === "assistant";
  const messageText = parts
    .filter((part): part is Extract<ChatContentPart, { type: "text" }> => part.type === "text")
    .map((part) => part.content)
    .join("\n\n");
  const timestamp = formatMessageTime(createdAt);
  const copyLabel = isAssistant ? "Copy response" : "Copy message";

  const copyMessage = React.useCallback(async () => {
    await navigator.clipboard.writeText(messageText);
    setCopied(true);
    if (copiedTimeoutRef.current !== null) window.clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = window.setTimeout(() => {
      copiedTimeoutRef.current = null;
      setCopied(false);
    }, 1_500);
  }, [messageText]);

  React.useEffect(() => () => {
    if (copiedTimeoutRef.current !== null) window.clearTimeout(copiedTimeoutRef.current);
  }, []);

  return (
    <Message
      from={role}
      className={cn(
        isAssistant ? "max-w-full gap-4" : "max-w-[min(82%,48rem)] gap-0",
      )}
    >
      {parts.map((part) => part.type === "tool" ? (
        <ChatToolStep key={part.id} toolCall={part.toolCall} />
      ) : (
        <MessageContent
          key={part.id}
          className={cn(
            isAssistant
              ? "w-full max-w-none text-[length:var(--type-body-size)] leading-[var(--type-body-line)]"
              : "rounded-[var(--r-4)] bg-secondary/70 px-4 py-2.5 text-[length:var(--type-body-size)] leading-[var(--type-body-line)]",
          )}
        >
          <MessageResponse isAnimating={isStreaming}>{part.content}</MessageResponse>
        </MessageContent>
      ))}

      {parts.length === 0 && isStreaming ? (
        <Inline gap="xs" className="text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
          <MetaText className="ml-1">Thinking</MetaText>
        </Inline>
      ) : null}

      {messageText && !isStreaming ? (
        <MessageActions
          data-testid={isAssistant ? "assistant-message-actions" : "user-message-actions"}
          className={cn(
            "gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
            isAssistant ? "-mt-2" : "ml-auto mt-1",
          )}
        >
          <MessageAction
            label={copied ? "Copied" : copyLabel}
            tooltip={copied ? "Copied" : copyLabel}
            className="h-7 w-7 p-1"
            onClick={() => void copyMessage()}
          >
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5" />
            ) : (
              <CopyIcon
                data-testid={isAssistant ? "copy-response-icon" : "copy-user-message-icon"}
                className="h-3.5 w-3.5"
              />
            )}
          </MessageAction>
          {timestamp ? (
            <MetaText
              as="time"
              dateTime={createdAt}
              title={timestamp.full}
              aria-label={timestamp.full}
              className="select-none"
            >
              {timestamp.short}
            </MetaText>
          ) : null}
        </MessageActions>
      ) : null}
    </Message>
  );
}

export function ChatToolStep({ toolCall }: { toolCall: ChatToolCall }) {
  const label = toolLabel(toolCall.tool);
  const statusLabel = toolCall.status === "calling"
    ? "Working"
    : toolCall.status === "error"
      ? "Failed"
      : "Completed";
  const statusIcon = toolCall.status === "calling"
    ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
    : toolCall.status === "error"
      ? <CircleAlertIcon className="h-3.5 w-3.5 text-destructive" />
      : null;

  return (
    <div className="flex w-fit max-w-full items-center gap-2 py-1 text-muted-foreground">
      <WrenchIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <MetaText as="span" className="truncate text-current">{label}</MetaText>
      {statusIcon ? (
        <span className="flex shrink-0 items-center" aria-hidden="true">
          {statusIcon}
        </span>
      ) : null}
      <span className="sr-only">{statusLabel}</span>
    </div>
  );
}

export function ChatEmptyState({
  onSuggestion,
}: {
  onSuggestion: (prompt: string) => void;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
      <Heading as="h2" variant="page">What can I help with?</Heading>
      <Text as="p" variant="muted" className="mt-2 max-w-lg">
        Ask about your tasks, projects, notes, activity, or anything you have saved.
      </Text>
      <div className="mt-7 grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2">
        {CHAT_SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
          <button
            key={label}
            type="button"
            className="group flex min-h-11 items-center gap-2.5 rounded-[var(--r-2)] px-3 py-2 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onSuggestion(prompt)}
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            <Text as="span">{label}</Text>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatComposer({
  status,
  connectionStatus,
  disabled,
  models,
  projects,
  selectedModel,
  selectedProjectId,
  onModelChange,
  onProjectChange,
  onStop,
  onSubmit,
}: {
  status: ChatStatus;
  connectionStatus: ChatConnectionStatus;
  disabled?: boolean;
  models: ChatComposerModel[];
  projects: ChatComposerProject[];
  selectedModel: string;
  selectedProjectId: string | null;
  onModelChange: (value: string) => void;
  onProjectChange: (projectId: string | null) => void;
  onStop: () => void;
  onSubmit: (message: PromptInputMessage) => void | Promise<void>;
}) {
  const connectionLabel = connectionStatus === "connected"
    ? "Workspace aware"
    : connectionStatus === "error"
      ? "Reconnecting"
      : "Connecting";
  const connectionIcon = connectionStatus === "connected"
    ? <SparklesIcon className="h-3 w-3" />
    : connectionStatus === "error"
      ? <WifiOffIcon className="h-3 w-3" />
      : <Loader2Icon className="h-3 w-3 animate-spin" />;

  return (
    <div data-testid="chat-composer" className="mx-auto w-full max-w-4xl px-6 pb-5 pt-2">
      <PromptInput
        onSubmit={onSubmit}
        className="rounded-[28px] bg-card shadow-[var(--shadow-inset)] transition-shadow focus-within:shadow-[var(--shadow-elevated)]"
      >
        <PromptInputTextarea
          autoFocus
          disabled={disabled || status === "streaming"}
          placeholder="Ask anything about your workspace…"
          className="max-h-48 min-h-20 px-5 pb-3 pt-5 text-[length:var(--type-body-size)] leading-[var(--type-body-line)]"
        />
        <PromptInputFooter className="px-3 pb-3 pt-0">
          <PromptInputTools className="min-w-0">
            {connectionStatus !== "connected" ? (
              <MetaChip
                icon={connectionIcon}
                className={cn(connectionStatus === "error" && "border-destructive/30 text-destructive")}
              >
                {connectionLabel}
              </MetaChip>
            ) : null}
            <PromptInputSelect
              value={selectedProjectId ?? "all-projects"}
              onValueChange={(value) => onProjectChange(value === "all-projects" ? null : value)}
              disabled={disabled || status === "streaming"}
            >
              <PromptInputSelectTrigger
                data-testid="chat-project-selector"
                className="h-8 max-w-52 gap-1.5 rounded-full border-0 bg-transparent px-2 text-foreground shadow-none hover:bg-secondary/70"
                aria-label="Select project context"
              >
                <FolderKanbanIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <PromptInputSelectValue placeholder="All projects" />
              </PromptInputSelectTrigger>
              <PromptInputSelectContent align="start">
                <PromptInputSelectItem value="all-projects">All projects</PromptInputSelectItem>
                {projects.map((project) => (
                  <PromptInputSelectItem key={project.id} value={project.id}>
                    {project.name}
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectContent>
            </PromptInputSelect>
          </PromptInputTools>
          <div className="flex min-w-0 items-center gap-1.5">
            <PromptInputSelect
              value={selectedModel}
              onValueChange={onModelChange}
              disabled={disabled || status === "streaming" || models.length === 0}
            >
              <PromptInputSelectTrigger
                data-testid="chat-model-selector"
                className="h-8 max-w-60 gap-1.5 rounded-full border-0 bg-transparent px-2 text-foreground shadow-none hover:bg-secondary/70"
                aria-label="Select chat model"
              >
                <SparklesIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <PromptInputSelectValue placeholder="Add a model key" />
              </PromptInputSelectTrigger>
              <PromptInputSelectContent align="end" className="max-h-80">
                {models.map((model) => (
                  <PromptInputSelectItem key={model.value} value={model.value}>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate">{model.name}</span>
                      <MetaText as="span" className="truncate">{model.providerName}</MetaText>
                    </span>
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectContent>
            </PromptInputSelect>
            <PromptInputSubmit
              disabled={disabled || !selectedModel}
              status={status}
              onStop={onStop}
              className="size-9 rounded-full"
            >
              {status === "ready" ? <CornerDownLeftIcon className="h-4 w-4" /> : undefined}
            </PromptInputSubmit>
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}

export type ChatComposerModel = {
  value: string;
  name: string;
  providerName: string;
};

export type ChatComposerProject = {
  id: string;
  name: string;
};

export function ChatErrorNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 pt-3">
      <Surface variant="soft" className="border-destructive/40 bg-destructive/10 px-3 py-2">
        <Text variant="danger">{children}</Text>
      </Surface>
    </div>
  );
}

function toolLabel(tool: string) {
  return TOOL_LABELS[tool] ?? tool
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function formatMessageTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const hour = date.getHours() % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, "0");
  return {
    short: `${hour}:${minute}`,
    full: date.toLocaleString(),
  };
}
