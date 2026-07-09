import * as React from "react";
import { CalendarDays, Clock, Flag, Zap } from "lucide-react";
import { Button } from "~/components/ui/button";
import { ImpactBadge, PriorityBadge, StatusBadge } from "~/components/ui/tone-badge";
import { Heading, MetaText, Text } from "~/components/ui/typography";
import { Cluster, Inline, Stack, Surface } from "~/components/layout";
import { DetailTile } from "~/components/patterns";
import { cn } from "~/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function TaskCard({
  title,
  description,
  completed,
  selected,
  metadata,
  actions,
  className,
  ...props
}: DivProps & {
  title: React.ReactNode;
  description?: React.ReactNode;
  completed?: boolean;
  selected?: boolean;
  metadata?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Surface
      variant="base"
      interactive
      className={cn("group min-w-0 p-3", selected && "border-primary ring-1 ring-primary", className)}
      {...props}
    >
      <Stack gap="sm">
        <Inline align="start" className="justify-between">
          <Stack gap="xs" className="min-w-0">
            <Heading as="div" variant="panel" className={cn("truncate", completed && "text-muted-foreground line-through decoration-muted-foreground/70")}>
              {title}
            </Heading>
            {description ? (
              <Text as="div" variant="muted" className="line-clamp-2">
                {description}
              </Text>
            ) : null}
          </Stack>
          {actions}
        </Inline>
        {metadata ? <TaskMetadata>{metadata}</TaskMetadata> : null}
      </Stack>
    </Surface>
  );
}

export function TaskMetadata({ className, ...props }: DivProps) {
  return <Cluster gap="sm" className={cn("text-muted-foreground", className)} {...props} />;
}

export function TaskToneMetadata({
  priority,
  impact,
  status,
  dueLabel,
}: {
  priority?: string | null;
  impact?: string | null;
  status?: string | null;
  dueLabel?: React.ReactNode;
}) {
  return (
    <>
      {priority ? <PriorityBadge priority={priority} /> : null}
      {impact ? <ImpactBadge impact={impact} /> : null}
      {status ? <StatusBadge status={status} /> : null}
      {dueLabel ? (
        <Inline gap="xs">
          <Clock className="h-3 w-3" />
          <MetaText>{dueLabel}</MetaText>
        </Inline>
      ) : null}
    </>
  );
}

export function TaskDetailTile(props: React.ComponentProps<typeof DetailTile>) {
  return <DetailTile {...props} />;
}

type SelectLikeProps = {
  value?: string | null;
  children?: React.ReactNode;
  className?: string;
};

export function TaskStatusSelect({ value, children, className }: SelectLikeProps) {
  return (
    <Surface variant="soft" className={cn("px-3 py-2", className)}>
      <Inline>
        <StatusBadge status={value} />
        {children}
      </Inline>
    </Surface>
  );
}

export function TaskPrioritySelect({ value, children, className }: SelectLikeProps) {
  return (
    <Surface variant="soft" className={cn("px-3 py-2", className)}>
      <Inline>
        <PriorityBadge priority={value} />
        {children}
      </Inline>
    </Surface>
  );
}

export function TaskImpactSelect({ value, children, className }: SelectLikeProps) {
  return (
    <Surface variant="soft" className={cn("px-3 py-2", className)}>
      <Inline>
        <ImpactBadge impact={value} />
        {children}
      </Inline>
    </Surface>
  );
}

export function TaskScheduleFieldset({
  title = "Schedule",
  children,
  className,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Surface variant="soft" className={cn("p-3", className)}>
      <Stack gap="sm">
        <Inline gap="xs">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Heading as="legend" variant="panel">{title}</Heading>
        </Inline>
        {children}
      </Stack>
    </Surface>
  );
}

export function TaskQuickAction(props: React.ComponentProps<typeof Button>) {
  return <Button variant="ghost" size="sm" {...props} />;
}

export const TaskIcons = { Flag, Zap, Clock, CalendarDays };

export {
  TaskCardVisual,
  type TaskCardTask,
} from "./task-card-visual";

export {
  TaskScheduleFields,
  createEnabledScheduleDraft,
  createScheduleDraft,
  getScheduleDraftPayload,
  isScheduleDraftValid,
  toDateTimeLocalValue,
  type TaskScheduleDraft,
} from "./task-schedule-fields";

export {
  DeleteTaskConfirmDialog,
} from "./delete-task-confirm-dialog";

export {
  DroppableColumn,
} from "./droppable-column";

export {
  ListTaskSection,
} from "./list-task-section";

export {
  TaskDialog,
  type TaskDialogInput,
  type TaskDialogMode,
  type TaskDialogTask,
} from "./task-dialog";

export {
  TaskSkeleton,
} from "./task-skeleton";

export {
  Task,
} from "./task";

export {
  SortableTask,
} from "./sortable-task";

export {
  KanbanTasks,
} from "./kanban-tasks";

export {
  ListTasks,
} from "./list-tasks";

export {
  Tasks,
  type ViewMode,
} from "./tasks";
