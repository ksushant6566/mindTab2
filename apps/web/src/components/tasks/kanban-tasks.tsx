import {
    DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, useSensor, useSensors, pointerWithin, CollisionDetection, rectIntersection,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { type CheckedState } from "@radix-ui/react-checkbox";
import React, { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useUpdateTaskPositions } from "~/api/hooks";
import { DroppableColumn } from "./droppable-column";
import { Task } from "./task";
import { SortableTask } from "./sortable-task";
import { TaskDialog, type TaskDialogInput } from "./task-dialog";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { ArchiveIcon, ChevronDownIcon, EyeOffIcon, PlusIcon } from "lucide-react";

type TTask = any;
type TaskStatus = "pending" | "in_progress" | "completed" | "archived";

interface KanbanTasksProps {
    pendingTasks?: TTask[]; inProgressTasks?: TTask[]; completedTasks?: TTask[]; archivedTasks?: TTask[];
    onEdit: (id: string) => void; onDelete: (id: string) => void; onToggleStatus: (id: string, checked: CheckedState) => void;
    onUpdate?: (id: string, task: Record<string, unknown>) => void;
    onCreate?: (task: TaskDialogInput & { status?: string; position?: number; projectId?: string | null; completedAt?: string }) => void;
    onArchiveCompleted?: () => void; onShowArchived?: () => void; showArchived?: boolean;
    isCreating?: boolean;
    isDeleting: boolean; deleteVariables?: string;
}

export const KanbanTasks: React.FC<KanbanTasksProps> = ({
    pendingTasks = [], inProgressTasks = [], completedTasks = [], archivedTasks = [],
    onEdit, onDelete, onToggleStatus, onUpdate, onCreate, onArchiveCompleted, onShowArchived, showArchived = false, isCreating = false, isDeleting, deleteVariables,
}) => {
    const qc = useQueryClient();
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [localPendingTasks, setLocalPendingTasks] = React.useState<TTask[]>([]);
    const [localInProgressTasks, setLocalInProgressTasks] = React.useState<TTask[]>([]);
    const [localCompletedTasks, setLocalCompletedTasks] = React.useState<TTask[]>([]);
    const [localArchivedTasks, setLocalArchivedTasks] = React.useState<TTask[]>([]);
    const [creatingStatus, setCreatingStatus] = React.useState<TaskStatus | null>(null);
    const sequenceRef = useRef(0);

    useEffect(() => {
        setLocalPendingTasks(pendingTasks); setLocalInProgressTasks(inProgressTasks);
        setLocalCompletedTasks(completedTasks); setLocalArchivedTasks(archivedTasks);
    }, [pendingTasks, inProgressTasks, completedTasks, archivedTasks]);

    const { mutate: updatePositions } = useUpdateTaskPositions();

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));
    const handleDragStart = (event: DragStartEvent) => { setActiveId(event.active.id as string); };

    const findContainer = (id: string): TaskStatus | undefined => {
        if (id === "pending" || id === "in_progress" || id === "completed" || id === "archived") return id;
        const task = [...localPendingTasks, ...localInProgressTasks, ...localCompletedTasks, ...localArchivedTasks].find((g) => g.id === id);
        return task?.status;
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) { setActiveId(null); return; }
        const activeTask = [...localPendingTasks, ...localInProgressTasks, ...localCompletedTasks, ...localArchivedTasks].find((g) => g.id === active.id);
        if (!activeTask) { setActiveId(null); return; }
        const overContainer = findContainer(over.id as string);
        if (!overContainer) { setActiveId(null); return; }

        const getTasks = (status: string) => {
            if (status === "pending") return [...localPendingTasks];
            if (status === "in_progress") return [...localInProgressTasks];
            if (status === "completed") return [...localCompletedTasks];
            return [...localArchivedTasks];
        };
        const setTasks = (status: string, tasks: TTask[]) => {
            if (status === "pending") setLocalPendingTasks(tasks);
            else if (status === "in_progress") setLocalInProgressTasks(tasks);
            else if (status === "completed") setLocalCompletedTasks(tasks);
            else setLocalArchivedTasks(tasks);
        };

        const sourceTasks = getTasks(activeTask.status);
        const destinationTasks = getTasks(overContainer);
        const oldIndex = sourceTasks.findIndex((g: any) => g.id === active.id);
        let newIndex = over.id === overContainer ? destinationTasks.length : destinationTasks.findIndex((g: any) => g.id === over.id);
        if (newIndex === -1) newIndex = destinationTasks.length;

        const isSameContainer = activeTask.status === overContainer;
        const updates: { id: string; position: number; status: TaskStatus }[] = [];

        if (isSameContainer) {
            const reorderedTasks = arrayMove(sourceTasks, oldIndex, newIndex);
            reorderedTasks.forEach((task: any, index: number) => { updates.push({ id: task.id, position: index, status: task.status }); });
            setTasks(overContainer, reorderedTasks);
        } else {
            sourceTasks.splice(oldIndex, 1);
            const updatedTask = { ...activeTask, status: overContainer };
            destinationTasks.splice(newIndex, 0, updatedTask);
            sourceTasks.forEach((task: any, index: number) => { updates.push({ id: task.id, position: index, status: task.status }); });
            destinationTasks.forEach((task: any, index: number) => { updates.push({ id: task.id, position: index, status: task.id === activeTask.id ? overContainer : task.status }); });
            setTasks(activeTask.status, sourceTasks);
            setTasks(overContainer, destinationTasks);
        }

        const sequence = ++sequenceRef.current;
        updatePositions(
            { tasks: updates, sequence } as any,
            {
                onError: (_err: any, _vars: any, context: any) => {
                    if (context?.sequence === sequenceRef.current) {
                        setLocalPendingTasks(pendingTasks);
                        setLocalInProgressTasks(inProgressTasks);
                        setLocalCompletedTasks(completedTasks);
                        setLocalArchivedTasks(archivedTasks);
                        context?.previousTasks?.forEach(([key, data]: any) => qc.setQueryData(key, data));
                    }
                },
                onSettled: (_data: any, _err: any, _vars: any, context: any) => {
                    if (context?.sequence === sequenceRef.current) {
                        qc.invalidateQueries({ queryKey: ["tasks"] });
                    }
                },
            }
        );
        setActiveId(null);
    };

    const handleDragCancel = () => { setActiveId(null); };

    const activeTask = React.useMemo(
        () => [...localPendingTasks, ...localInProgressTasks, ...localCompletedTasks, ...localArchivedTasks].find((g) => g.id === activeId),
        [activeId, localPendingTasks, localInProgressTasks, localCompletedTasks, localArchivedTasks]
    );

    const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
        const rectIntersectionCollisions = rectIntersection(args);
        if (rectIntersectionCollisions.length > 0) return rectIntersectionCollisions;
        const containerCollisions = pointerWithin(args);
        if (containerCollisions.length > 0) {
            const columnIds = ["pending", "in_progress", "completed", "archived"];
            const columnCollision = containerCollisions.find((c) => columnIds.includes(c.id as string));
            if (columnCollision) return [columnCollision];
        }
        return [];
    }, []);

    const renderTasks = (tasks: TTask[]) => tasks.map((task: any) => (
        <SortableTask
            key={task.id}
            task={task}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleStatus={onToggleStatus}
            onUpdate={onUpdate}
            isDeleting={isDeleting}
            deleteVariables={deleteVariables}
            surface="kanban"
        />
    ));

    const getLocalTasksByStatus = (status: TaskStatus) => {
        if (status === "pending") return localPendingTasks;
        if (status === "in_progress") return localInProgressTasks;
        if (status === "completed") return localCompletedTasks;
        return localArchivedTasks;
    };

    const handleCreateTask = (status: TaskStatus, task: TaskDialogInput) => {
        onCreate?.({
            ...task,
            status,
            position: getLocalTasksByStatus(status).length,
            completedAt: status === "completed" ? new Date().toISOString() : undefined,
        });
        setCreatingStatus(null);
    };

    const renderCreateAction = (status: TaskStatus) => {
        if (!onCreate || status === "archived") return null;

        return (
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 rounded-[var(--r-2)] px-2 font-mono text-[10px] uppercase tracking-[0.08em]"
                onClick={() => setCreatingStatus(status)}
            >
                <PlusIcon className="mr-1 h-3.5 w-3.5" />
                Add
            </Button>
        );
    };

    return (
        <DndContext sensors={sensors} collisionDetection={collisionDetectionStrategy} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
            <ScrollArea className="relative min-h-0 w-full flex-1 overflow-y-auto">
                <div className="grid min-h-full w-full min-w-[780px] gap-3 pb-6" style={{ gridTemplateColumns: showArchived ? "repeat(4, minmax(240px, 1fr))" : "repeat(3, minmax(260px, 1fr))" }}>
                    <DroppableColumn id="pending" title="To Do" count={localPendingTasks.length} description="Queued, clarified, ready to pull" action={renderCreateAction("pending")} onCreate={() => setCreatingStatus("pending")}>
                        <SortableContext items={localPendingTasks.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>{renderTasks(localPendingTasks)}</SortableContext>
                    </DroppableColumn>
                    <DroppableColumn id="in_progress" title="In Progress" count={localInProgressTasks.length} description="Active commitments, limited by focus" action={renderCreateAction("in_progress")} onCreate={() => setCreatingStatus("in_progress")}>
                        <SortableContext items={localInProgressTasks.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>{renderTasks(localInProgressTasks)}</SortableContext>
                    </DroppableColumn>
                    <DroppableColumn
                        id="completed"
                        title="Done"
                        count={localCompletedTasks.length}
                        description="Finished work waiting to be cleared"
                        action={
                            <div className="flex items-center gap-1">
                                {renderCreateAction("completed")}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild className="focus-visible:ring-0 focus-visible:ring-offset-0">
                                        <Button variant="ghost" size="sm" className="h-7 px-2 rounded-[var(--r-2)] focus-visible:ring-0 focus-visible:ring-offset-0" title="Archive options">
                                            <ArchiveIcon className="h-3.5 w-3.5 mr-1" /><ChevronDownIcon className="h-3 w-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48 focus-visible:ring-0 focus-visible:ring-offset-0">
                                        <DropdownMenuItem onClick={onArchiveCompleted} className="cursor-pointer"><ArchiveIcon className="h-4 w-4 mr-2" />Archive completed</DropdownMenuItem>
                                        <DropdownMenuItem onClick={onShowArchived} className="cursor-pointer"><ArchiveIcon className="h-4 w-4 mr-2" />{showArchived ? "Hide archived" : "Show archived"}</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        }
                        onCreate={() => setCreatingStatus("completed")}
                    >
                        <SortableContext items={localCompletedTasks.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>{renderTasks(localCompletedTasks)}</SortableContext>
                    </DroppableColumn>
                    {showArchived && (
                        <DroppableColumn
                            id="archived"
                            title="Archive"
                            count={localArchivedTasks.length}
                            description="Quiet storage for closed loops"
                            action={<TooltipProvider><Tooltip delayDuration={0}><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 px-2 rounded-[var(--r-2)] focus-visible:ring-0 focus-visible:ring-offset-0" onClick={onShowArchived}><EyeOffIcon className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent><p>Hide archived tasks</p></TooltipContent></Tooltip></TooltipProvider>}
                        >
                            <SortableContext items={localArchivedTasks.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>{renderTasks(localArchivedTasks)}</SortableContext>
                        </DroppableColumn>
                    )}
                </div>
            </ScrollArea>
            <DragOverlay>
                {activeTask ? (
                    <div className="w-[320px]">
                        <Task
                            task={activeTask}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onToggleStatus={onToggleStatus}
                            onUpdate={onUpdate}
                            isDeleting={isDeleting}
                            deleteVariables={deleteVariables}
                            surface="kanban"
                            isOverlay
                        />
                    </div>
                ) : null}
            </DragOverlay>
            <TaskDialog
                mode="create"
                open={creatingStatus !== null}
                onOpenChange={(open) => {
                    if (!open) setCreatingStatus(null);
                }}
                defaultValues={{ status: creatingStatus ?? "pending" }}
                onCreate={(task) => {
                    if (!creatingStatus) return;
                    handleCreateTask(creatingStatus, task);
                }}
                isSaving={isCreating}
            />
        </DndContext>
    );
};
