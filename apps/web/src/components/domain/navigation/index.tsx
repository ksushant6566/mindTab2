import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, MessageSquare, Pin } from "lucide-react";
import { Heading, MetaText, Text } from "~/components/ui/typography";
import { Inline, ScrollPanel, Stack } from "~/components/layout";
import { cn } from "~/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;
const sidebarItemClassName =
  "text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";
const sidebarItemActiveClassName = "bg-secondary text-foreground";

export function SidebarShell({ className, ...props }: DivProps) {
  return <aside className={cn("flex h-full min-h-0 flex-col border-r border-border bg-card/85 text-card-foreground backdrop-blur", className)} {...props} />;
}

export function SidebarHeader({ className, ...props }: DivProps) {
  return <div className={cn("flex h-10 items-center justify-between gap-2 px-3", className)} {...props} />;
}

export function SidebarSection({
  title,
  children,
  className,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      {title ? <Heading as="div" variant="panel" className="mb-1 px-3 text-muted-foreground">{title}</Heading> : null}
      <Stack gap="xs">{children}</Stack>
    </section>
  );
}

export function SidebarSectionTrigger({
  open,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  open?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-[var(--r-2)] px-3 text-left text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)]",
        sidebarItemClassName,
        className
      )}
      {...props}
    >
      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function SidebarItem({
  active,
  icon,
  trailing,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "group flex h-8 w-full items-center gap-2 rounded-[var(--r-2)] px-3 text-left text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)]",
        sidebarItemClassName,
        active && sidebarItemActiveClassName,
        className
      )}
      {...props}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </button>
  );
}

export function SidebarSubItem(props: React.ComponentProps<typeof SidebarItem>) {
  return <SidebarItem {...props} className={cn("pl-9", props.className)} />;
}

export function SidebarProjectItem(props: React.ComponentProps<typeof SidebarItem> & { pinned?: boolean }) {
  return <SidebarItem {...props} />;
}

export function SidebarChatItem({
  time,
  children,
  ...props
}: React.ComponentProps<typeof SidebarItem> & {
  time?: React.ReactNode;
}) {
  return <SidebarItem trailing={time ? <MetaText>{time}</MetaText> : props.trailing} {...props}>{children}</SidebarItem>;
}

export type SidebarAccountUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function SidebarAccountItem({
  user,
  onClick,
  className,
}: {
  user?: SidebarAccountUser | null;
  onClick?: () => void;
  className?: string;
}) {
  const displayName = user?.name || user?.email || "MindTab user";
  const content = (
    <>
      <SidebarAccountAvatar user={user} />
      <span className="min-w-0 flex-1">
        <Text as="span" className="block truncate">{displayName}</Text>
        {user?.email ? <MetaText as="span" className="block truncate">{user.email}</MetaText> : null}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn("flex min-h-16 w-full min-w-0 items-center gap-3 px-4 py-3 text-left", sidebarItemClassName, className)}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={cn("flex min-h-16 min-w-0 items-center gap-3 px-4 py-3", className)}>
      {content}
    </div>
  );
}

export function SidebarAccountMenu({ className, ...props }: DivProps) {
  return <div className={cn("border-t border-border", className)} {...props} />;
}

export function SidebarAccountPopover({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        "absolute bottom-[72px] left-3 right-3 z-20 overflow-hidden rounded-[var(--r-3)] border border-border bg-popover p-2 text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)] text-popover-foreground shadow-[var(--shadow-popover)]",
        className
      )}
      {...props}
    />
  );
}

export function SidebarAccountPopoverHeader({ className, ...props }: DivProps) {
  return <div className={cn("flex h-9 items-center border-b border-border px-2 text-muted-foreground", className)} {...props} />;
}

function SidebarAccountAvatar({ user }: { user?: SidebarAccountUser | null }) {
  const displayName = user?.name || user?.email || "M";

  return (
    <span className="flex size-9 shrink-0 overflow-hidden rounded-full border border-border bg-secondary text-sm text-foreground">
      {user?.image ? (
        <img src={user.image} alt={displayName} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          {(displayName[0] ?? "M").toUpperCase()}
        </span>
      )}
    </span>
  );
}

export function SidebarContent({ className, ...props }: DivProps) {
  return <ScrollPanel className={cn("flex-1 px-2 py-3", className)} {...props} />;
}

export function SidebarLogo({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Inline className={cn("h-12 px-3", className)}>
      <span className="truncate text-[1.375rem] font-[300] leading-none text-foreground">{children}</span>
    </Inline>
  );
}

export function SidebarActionButton({
  icon,
  label,
  collapsed,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={collapsed ? label : undefined}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center rounded-[var(--r-3)] text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)]",
        sidebarItemClassName,
        collapsed ? "justify-center px-0" : "gap-3 px-2"
      )}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

export function SidebarSectionButton({
  children,
  open,
  onClick,
}: {
  children: React.ReactNode;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center justify-between rounded-[var(--r-2)] px-2 text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)]",
        sidebarItemClassName,
        "text-muted-foreground/70"
      )}
    >
      <span>{children}</span>
      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  );
}

export type SidebarProjectConversation = {
  id: string;
  title?: string | null;
};

export function SidebarProjectGroup({
  id,
  name,
  taskCount,
  noteCount,
  conversations,
  open,
  pinned,
  taskActive,
  notesActive,
  activeConversationPath,
  onToggle,
  onTogglePinned,
  onOpenTasks,
  onOpenNotes,
}: {
  id: string;
  name?: string | null;
  taskCount?: number | null;
  noteCount?: number | null;
  conversations: SidebarProjectConversation[];
  open: boolean;
  pinned: boolean;
  taskActive: boolean;
  notesActive: boolean;
  activeConversationPath: string;
  onToggle: () => void;
  onTogglePinned: () => void;
  onOpenTasks: () => void;
  onOpenNotes: () => void;
}) {
  return (
    <div className="space-y-0.5">
      <div className={cn("group flex h-9 items-center rounded-[var(--r-3)]", sidebarItemClassName)}>
        <button
          type="button"
          onClick={onToggle}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-l-[var(--r-3)] px-2 text-left text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)]"
        >
          <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{name || "Untitled project"}</span>
          <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </span>
        </button>
        <button
          type="button"
          title={pinned ? "Unpin project" : "Pin project"}
          aria-label={pinned ? "Unpin project" : "Pin project"}
          onClick={onTogglePinned}
          className="flex h-9 w-8 items-center justify-center rounded-r-[var(--r-3)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <Pin className={cn("h-3.5 w-3.5", pinned && "fill-current text-foreground")} />
        </button>
      </div>
      {open ? (
        <div className="space-y-0.5">
          <SidebarProjectSubButton active={taskActive} icon={<Folder className="h-3.5 w-3.5" />} count={taskCount ?? 0} onClick={onOpenTasks}>
            Tasks
          </SidebarProjectSubButton>
          <SidebarProjectSubButton active={notesActive} icon={<FileText className="h-3.5 w-3.5" />} count={noteCount ?? 0} onClick={onOpenNotes}>
            Notes
          </SidebarProjectSubButton>
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              to="/chat/$conversationId"
              params={{ conversationId: conversation.id }}
              className={cn(
                "flex h-8 w-full items-center justify-start gap-2 rounded-[var(--r-3)] pl-8 pr-2 text-left text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)]",
                sidebarItemClassName,
                activeConversationPath === `/chat/${conversation.id}` && sidebarItemActiveClassName
              )}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{conversation.title || "Untitled chat"}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SidebarProjectSubButton({
  active,
  icon,
  count,
  onClick,
  children,
}: {
  active: boolean;
  icon: React.ReactNode;
  count: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center justify-start gap-2 rounded-[var(--r-3)] pl-8 pr-2 text-left text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)]",
        sidebarItemClassName,
        active && sidebarItemActiveClassName
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span>{count}</span>
    </button>
  );
}

export function SidebarGeneralChatLink({
  id,
  title,
  time,
  active,
}: {
  id: string;
  title?: string | null;
  time?: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      to="/chat/$conversationId"
      params={{ conversationId: id }}
      className={cn(
        "flex h-8 items-center rounded-[var(--r-3)] px-2 text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)]",
        sidebarItemClassName,
        active && sidebarItemActiveClassName
      )}
    >
      <span className="min-w-0 flex-1 truncate">{title || "Untitled chat"}</span>
      {time ? <MetaText className="shrink-0">{time}</MetaText> : null}
    </Link>
  );
}
