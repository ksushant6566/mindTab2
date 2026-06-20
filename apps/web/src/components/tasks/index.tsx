import { type CheckedState } from "@radix-ui/react-checkbox";
import { Plus } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { tasksQueryOptions, useCreateTask, useUpdateTask, useDeleteTask, useArchiveCompletedTasks } from "~/api/hooks";
import { TaskSkeleton } from "./task-skeleton";
import { KanbanTasks } from "./kanban-tasks";
import { ListTasks } from "./list-tasks";
import { TaskDialog, type TaskDialogInput } from "./task-dialog";
import { getScheduleDraftPayload } from "./task-schedule-fields";
import { useCalendarSchedules } from "~/lib/calendar-schedules";
import { useAppStore } from "@mindtab/core";

export type ViewMode = "list" | "kanban";
type TasksProps = { viewMode: ViewMode; };

const getTaskProjectId = (task: any) => task?.projectId ?? task?.project?.id ?? null;

export const Tasks: React.FC<TasksProps> = ({ viewMode }) => {
    const { activeProjectId } = useAppStore();
    const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
    const [editTaskId, setEditTaskId] = useState<string | null>(null);
    const [showArchived, setShowArchived] = useState(false);

    const { data: tasks, isLoading } = useQuery({
        ...tasksQueryOptions(activeProjectId ? { projectId: activeProjectId, includeArchived: showArchived } : { includeArchived: showArchived }),
    });

    const { mutate: createTask, isPending: isCreatingTask } = useCreateTask();
    const { mutate: updateTask } = useUpdateTask();
    const { mutate: deleteTask, isPending: isDeletingTask, variables: deleteTaskVariables } = useDeleteTask();
    const { mutate: archiveCompletedTasks } = useArchiveCompletedTasks();
    const { scheduleTask } = useCalendarSchedules();

    const onCreateTask = (task: TaskDialogInput & { status?: string; position?: number; projectId?: string | null; completedAt?: string }) => {
        const { schedule, ...taskFields } = task;
        const taskData = activeProjectId ? { ...taskFields, projectId: activeProjectId } : taskFields;
        const schedulePayload = getScheduleDraftPayload(schedule);
        createTask(taskData, {
            onSuccess: (createdTask: any) => {
                if (createdTask?.id && schedulePayload) {
                    scheduleTask(createdTask.id, schedulePayload.startAt, schedulePayload.durationMinutes);
                }
            },
        });
        setIsCreateTaskOpen(false);
    };

    const toggleTaskStatus = (taskId: string, checked: CheckedState) => {
        const task = (tasks as any[])?.find((g: any) => g.id === taskId);
        if (!task) return;
        let newStatus: string;
        if (task.status === "pending") newStatus = "in_progress";
        else if (task.status === "in_progress") newStatus = "completed";
        else newStatus = "pending";
        updateTask({
            id: taskId,
            title: task.title,
            description: task.description ?? undefined,
            status: newStatus,
            priority: task.priority,
            impact: task.impact,
            position: task.position,
            projectId: getTaskProjectId(task),
        });
    };

    const handleDeleteTask = (taskId: string) => deleteTask(taskId);
    const handleUpdateTask = (taskId: string, task: Record<string, unknown>) => {
        const existingTask = (tasks as any[])?.find((g: any) => g.id === taskId);
        const sanitizedTask = Object.fromEntries(Object.entries(task).filter(([_, v]) => v !== undefined));
        if (existingTask && !("projectId" in sanitizedTask)) {
            sanitizedTask.projectId = getTaskProjectId(existingTask);
        }
        updateTask({ ...sanitizedTask, id: taskId } as { id: string; title?: string; description?: string; status?: string; priority?: string; impact?: string; position?: number; projectId?: string | null; completedAt?: string | null });
    };

    const handleArchiveCompleted = () => { archiveCompletedTasks(); };
    const handleShowArchived = () => { setShowArchived(!showArchived); };

    const sortedPendingTasks = useMemo(() => (tasks as any[])?.filter((g: any) => g.status === "pending"), [tasks]);
    const sortedInProgressTasks = useMemo(() => (tasks as any[])?.filter((g: any) => g.status === "in_progress"), [tasks]);
    const sortedCompletedTasks = useMemo(() => (tasks as any[])?.filter((g: any) => g.status === "completed"), [tasks]);
    const sortedArchivedTasks = useMemo(() => (tasks as any[])?.filter((g: any) => g.status === "archived"), [tasks]);

    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col">
                {isLoading ? (
                    <TaskSkeleton viewMode={viewMode} />
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-1">
                        {viewMode === "list" && (
                            <div className="-ml-1 flex justify-start">
                                <Button onClick={() => setIsCreateTaskOpen(true)} disabled={isCreatingTask} variant="ghost" size="sm" className="flex items-center gap-2 text-sm font-normal">
                                    <Plus className="h-4 w-4" /> Add Task
                                </Button>
                            </div>
                        )}
                        <TaskDialog
                            mode="create"
                            open={isCreateTaskOpen}
                            onOpenChange={setIsCreateTaskOpen}
                            defaultValues={{ status: "pending", projectId: activeProjectId }}
                            onCreate={(task) => onCreateTask({ ...task, status: "pending" })}
                            isSaving={isCreatingTask}
                        />
                        {editTaskId && (tasks as any[])?.find((g: any) => g.id === editTaskId) && (
                            <TaskDialog
                                mode="edit"
                                open={!!editTaskId}
                                onOpenChange={(open: boolean) => { if (!open) setEditTaskId(null); }}
                                task={(tasks as any[]).find((g: any) => g.id === editTaskId)!}
                                onUpdate={(taskId, values) => {
                                    handleUpdateTask(taskId, values);
                                    setEditTaskId(null);
                                }}
                                onDelete={handleDeleteTask}
                                onToggleStatus={toggleTaskStatus}
                                isDeleting={isDeletingTask}
                                deleteVariables={deleteTaskVariables}
                            />
                        )}
                        {viewMode === "list" ? (
                            <ListTasks pendingTasks={sortedPendingTasks} inProgressTasks={sortedInProgressTasks} completedTasks={sortedCompletedTasks} onEdit={setEditTaskId} onDelete={handleDeleteTask} onToggleStatus={toggleTaskStatus} onUpdate={handleUpdateTask} onArchiveCompleted={handleArchiveCompleted} isDeleting={isDeletingTask} deleteVariables={deleteTaskVariables} />
                        ) : (
                            <KanbanTasks pendingTasks={sortedPendingTasks} inProgressTasks={sortedInProgressTasks} completedTasks={sortedCompletedTasks} archivedTasks={sortedArchivedTasks} onEdit={setEditTaskId} onDelete={handleDeleteTask} onToggleStatus={toggleTaskStatus} onUpdate={handleUpdateTask} onCreate={onCreateTask} onArchiveCompleted={handleArchiveCompleted} onShowArchived={handleShowArchived} showArchived={showArchived} isCreating={isCreatingTask} isDeleting={isDeletingTask} deleteVariables={deleteTaskVariables} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
