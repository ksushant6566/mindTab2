import { type CheckedState } from "@radix-ui/react-checkbox";
import { Plus } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { tasksQueryOptions, useCreateTask, useUpdateTask, useDeleteTask, useArchiveCompletedTasks } from "~/api/hooks";
import { TaskSkeleton } from "./task-skeleton";
import { KanbanTasks } from "./kanban-tasks";
import { ListTasks } from "./list-tasks";
import { TaskDialog, type TaskDialogInput, type TaskDialogMode } from "./task-dialog";
import { getScheduleDraftPayload } from "./task-schedule-fields";
import { useDashboardNavigation } from "~/lib/dashboard-navigation";

export type ViewMode = "list" | "kanban";
type TasksProps = { viewMode: ViewMode; };

const getTaskProjectId = (task: any) => task?.projectId ?? task?.project?.id ?? null;

const isStatusOnlyUpdate = (values: Record<string, unknown>) => {
    const keys = Object.entries(values)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key);
    return keys.length === 1 && keys[0] === "status";
};

export const Tasks: React.FC<TasksProps> = ({ viewMode }) => {
    const { activeProjectId } = useDashboardNavigation();
    const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
    const [editTaskId, setEditTaskId] = useState<string | null>(null);
    const [editTaskMode, setEditTaskMode] = useState<TaskDialogMode>("view");
    const [editTaskSnapshot, setEditTaskSnapshot] = useState<any | null>(null);
    const [showArchived, setShowArchived] = useState(false);

    const { data: tasks, isLoading } = useQuery({
        ...tasksQueryOptions(activeProjectId ? { projectId: activeProjectId, includeArchived: showArchived } : { includeArchived: showArchived }),
    });

    const { mutate: createTask, isPending: isCreatingTask } = useCreateTask();
    const { mutate: updateTask } = useUpdateTask();
    const { mutate: deleteTask, isPending: isDeletingTask, variables: deleteTaskVariables } = useDeleteTask();
    const { mutate: archiveCompletedTasks } = useArchiveCompletedTasks();
    const onCreateTask = (task: TaskDialogInput & { status?: string; position?: number; projectId?: string | null; completedAt?: string }) => {
        const { schedule, ...taskFields } = task;
        const schedulePayload = getScheduleDraftPayload(schedule);
        const taskData = {
            ...taskFields,
            ...(activeProjectId ? { projectId: activeProjectId } : {}),
            ...(schedulePayload ? {
                scheduledStartAt: schedulePayload.startAt.toISOString(),
                scheduledEndAt: schedulePayload.endAt.toISOString(),
            } : {}),
        };
        createTask(taskData);
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
    const openTaskDialog = (taskId: string, mode: "view" | "edit" = "view") => {
        const existingTask = (tasks as any[])?.find((g: any) => g.id === taskId);
        setEditTaskSnapshot(existingTask ?? null);
        setEditTaskMode(mode);
        setEditTaskId(taskId);
    };

    const sortedPendingTasks = useMemo(() => (tasks as any[])?.filter((g: any) => g.status === "pending"), [tasks]);
    const sortedInProgressTasks = useMemo(() => (tasks as any[])?.filter((g: any) => g.status === "in_progress"), [tasks]);
    const sortedCompletedTasks = useMemo(() => (tasks as any[])?.filter((g: any) => g.status === "completed"), [tasks]);
    const sortedArchivedTasks = useMemo(() => (tasks as any[])?.filter((g: any) => g.status === "archived"), [tasks]);
    const currentEditTask = useMemo(() => {
        if (!editTaskId) return null;
        const taskFromQuery = (tasks as any[])?.find((g: any) => g.id === editTaskId) ?? null;
        if (editTaskSnapshot?.id === editTaskId) {
            return { ...(taskFromQuery ?? {}), ...editTaskSnapshot };
        }
        return taskFromQuery;
    }, [editTaskId, editTaskSnapshot, tasks]);

    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col">
                {isLoading ? (
                    <TaskSkeleton viewMode={viewMode} />
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-1">
                        {viewMode === "list" && (
                            <div className="-ml-1 flex justify-start">
                                <Button onClick={() => setIsCreateTaskOpen(true)} disabled={isCreatingTask} variant="ghost" size="sm" className="flex items-center gap-2">
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
                        {editTaskId && currentEditTask && (
                            <TaskDialog
                                mode={editTaskMode}
                                open={!!editTaskId}
                                onOpenChange={(open: boolean) => {
                                    if (!open) {
                                        setEditTaskId(null);
                                        setEditTaskMode("view");
                                        setEditTaskSnapshot(null);
                                    }
                                }}
                                task={currentEditTask}
                                onUpdate={(taskId, values) => {
                                    handleUpdateTask(taskId, values);
                                    if (isStatusOnlyUpdate(values)) {
                                        setEditTaskSnapshot((current: any | null) => current?.id === taskId ? { ...current, ...values } : current);
                                    } else {
                                        setEditTaskId(null);
                                        setEditTaskMode("view");
                                        setEditTaskSnapshot(null);
                                    }
                                }}
                                onDelete={handleDeleteTask}
                                onToggleStatus={toggleTaskStatus}
                                isDeleting={isDeletingTask}
                                deleteVariables={deleteTaskVariables}
                            />
                        )}
                        {viewMode === "list" ? (
                            <ListTasks pendingTasks={sortedPendingTasks} inProgressTasks={sortedInProgressTasks} completedTasks={sortedCompletedTasks} onEdit={openTaskDialog} onDelete={handleDeleteTask} onToggleStatus={toggleTaskStatus} onUpdate={handleUpdateTask} onArchiveCompleted={handleArchiveCompleted} isDeleting={isDeletingTask} deleteVariables={deleteTaskVariables} />
                        ) : (
                            <KanbanTasks pendingTasks={sortedPendingTasks} inProgressTasks={sortedInProgressTasks} completedTasks={sortedCompletedTasks} archivedTasks={sortedArchivedTasks} onEdit={openTaskDialog} onDelete={handleDeleteTask} onToggleStatus={toggleTaskStatus} onUpdate={handleUpdateTask} onCreate={onCreateTask} onArchiveCompleted={handleArchiveCompleted} onShowArchived={handleShowArchived} showArchived={showArchived} isCreating={isCreatingTask} isDeleting={isDeletingTask} deleteVariables={deleteTaskVariables} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
