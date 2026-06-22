import {
    DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable, pointerWithin, CollisionDetection, rectIntersection,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { type CheckedState } from "@radix-ui/react-checkbox";
import React, { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useUpdateTaskPositions } from "~/api/hooks";
import { Task } from "./task";
import { SortableTask } from "./sortable-task";
import { Button } from "~/components/ui/button";
import { ArchiveIcon } from "lucide-react";
import { cn } from "~/lib/utils";

type TTask = any;
type TaskStatus = "pending" | "in_progress" | "completed" | "archived";

interface ListTasksProps {
    pendingTasks?: TTask[];
    inProgressTasks?: TTask[];
    completedTasks?: TTask[];
    onEdit: (id: string, mode?: "view" | "edit") => void;
    onDelete: (id: string) => void;
    onToggleStatus: (id: string, checked: CheckedState) => void;
    onUpdate?: (id: string, task: Record<string, unknown>) => void;
    onArchiveCompleted?: () => void;
    isDeleting: boolean;
    deleteVariables?: string;
}

export const ListTasks: React.FC<ListTasksProps> = ({
    pendingTasks = [], inProgressTasks = [], completedTasks = [],
    onEdit, onDelete, onToggleStatus, onUpdate, onArchiveCompleted, isDeleting, deleteVariables,
}) => {
    const qc = useQueryClient();
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [localPendingTasks, setLocalPendingTasks] = React.useState<TTask[]>([]);
    const [localInProgressTasks, setLocalInProgressTasks] = React.useState<TTask[]>([]);
    const [localCompletedTasks, setLocalCompletedTasks] = React.useState<TTask[]>([]);
    const sequenceRef = useRef(0);

    useEffect(() => {
        setLocalPendingTasks(pendingTasks);
        setLocalInProgressTasks(inProgressTasks);
        setLocalCompletedTasks(completedTasks);
    }, [pendingTasks, inProgressTasks, completedTasks]);

    const { mutate: updatePositions } = useUpdateTaskPositions();

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor)
    );

    const handleDragStart = (event: DragStartEvent) => { setActiveId(event.active.id as string); };

    const findContainer = (id: string) => {
        if (id === "pending" || id === "in_progress" || id === "completed") return id;
        const task = [...localPendingTasks, ...localInProgressTasks, ...localCompletedTasks].find((task) => task.id === id);
        return task?.status;
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) { setActiveId(null); return; }
        const activeTask = [...localPendingTasks, ...localInProgressTasks, ...localCompletedTasks].find((task) => task.id === active.id);
        if (!activeTask) { setActiveId(null); return; }
        const overContainer = findContainer(over.id as string);
        if (!overContainer) { setActiveId(null); return; }

        let sourceTasks: TTask[];
        let destinationTasks: TTask[];
        if (activeTask.status === "pending") sourceTasks = [...localPendingTasks];
        else if (activeTask.status === "in_progress") sourceTasks = [...localInProgressTasks];
        else sourceTasks = [...localCompletedTasks];
        if (overContainer === "pending") destinationTasks = [...localPendingTasks];
        else if (overContainer === "in_progress") destinationTasks = [...localInProgressTasks];
        else destinationTasks = [...localCompletedTasks];

        const oldIndex = sourceTasks.findIndex((g: any) => g.id === active.id);
        let newIndex = over.id === overContainer ? destinationTasks.length : destinationTasks.findIndex((g: any) => g.id === over.id);
        if (newIndex === -1) newIndex = destinationTasks.length;
        const isSameContainer = activeTask.status === overContainer;
        const updates: { id: string; position: number; status: TaskStatus }[] = [];

        if (isSameContainer) {
            const reorderedTasks = arrayMove(sourceTasks, oldIndex, newIndex);
            reorderedTasks.forEach((task: any, index: number) => { updates.push({ id: task.id, position: index, status: task.status }); });
            if (overContainer === "pending") setLocalPendingTasks(reorderedTasks);
            else if (overContainer === "in_progress") setLocalInProgressTasks(reorderedTasks);
            else setLocalCompletedTasks(reorderedTasks);
        } else {
            sourceTasks.splice(oldIndex, 1);
            const updatedTask = { ...activeTask, status: overContainer };
            destinationTasks.splice(newIndex, 0, updatedTask);
            sourceTasks.forEach((task: any, index: number) => { updates.push({ id: task.id, position: index, status: task.status }); });
            destinationTasks.forEach((task: any, index: number) => { updates.push({ id: task.id, position: index, status: task.id === activeTask.id ? overContainer : task.status }); });
            if (activeTask.status === "pending") setLocalPendingTasks(sourceTasks);
            else if (activeTask.status === "in_progress") setLocalInProgressTasks(sourceTasks);
            else setLocalCompletedTasks(sourceTasks);
            if (overContainer === "pending") setLocalPendingTasks(destinationTasks);
            else if (overContainer === "in_progress") setLocalInProgressTasks(destinationTasks);
            else setLocalCompletedTasks(destinationTasks);
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
        () => [...localPendingTasks, ...localInProgressTasks, ...localCompletedTasks].find((task) => task.id === activeId),
        [activeId, localPendingTasks, localInProgressTasks, localCompletedTasks]
    );

    const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
        const rectIntersectionCollisions = rectIntersection(args);
        if (rectIntersectionCollisions.length > 0) return rectIntersectionCollisions;
        const containerCollisions = pointerWithin(args);
        if (containerCollisions.length > 0) {
            const sectionIds = ["pending", "in_progress", "completed"];
            const sectionCollision = containerCollisions.find((collision) => sectionIds.includes(collision.id as string));
            if (sectionCollision) return [sectionCollision];
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
            surface="list"
        />
    ));

    return (
        <DndContext sensors={sensors} collisionDetection={collisionDetectionStrategy} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
            <ScrollArea className="relative min-h-0 w-full flex-1 overflow-y-auto">
                <div className="flex flex-col gap-3 pr-3 pb-6">
                    <ListTaskSection id="pending" title="To Do" count={localPendingTasks.length} description="Queued, clarified, ready to pull">
                        <SortableContext items={localPendingTasks.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>
                            {renderTasks(localPendingTasks)}
                        </SortableContext>
                    </ListTaskSection>
                    <ListTaskSection id="in_progress" title="In Progress" count={localInProgressTasks.length} description="Active commitments, limited by focus">
                        <SortableContext items={localInProgressTasks.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>
                            {renderTasks(localInProgressTasks)}
                        </SortableContext>
                    </ListTaskSection>
                    <ListTaskSection
                        id="completed"
                        title="Done"
                        count={localCompletedTasks.length}
                        description="Finished work waiting to be cleared"
                        action={
                            localCompletedTasks.length > 0 && onArchiveCompleted ? (
                                <Button variant="ghost" size="sm" className="h-7 rounded-[var(--r-2)] px-2" onClick={onArchiveCompleted} title="Archive all completed">
                                    <ArchiveIcon className="mr-1.5 h-3.5 w-3.5" />
                                    Archive
                                </Button>
                            ) : null
                        }
                    >
                        <SortableContext items={localCompletedTasks.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>
                            {renderTasks(localCompletedTasks)}
                        </SortableContext>
                    </ListTaskSection>
                </div>
            </ScrollArea>
            <DragOverlay>
                {activeTask ? (
                    <div className="w-full max-w-2xl">
                        <Task
                            task={activeTask}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onToggleStatus={onToggleStatus}
                            onUpdate={onUpdate}
                            isDeleting={isDeleting}
                            deleteVariables={deleteVariables}
                            surface="list"
                            isOverlay
                        />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

function ListTaskSection({
    id,
    title,
    count,
    description,
    action,
    children,
}: {
    id: TaskStatus;
    title: string;
    count: number;
    description: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    const { setNodeRef, isOver, active } = useDroppable({ id });

    return (
        <section
            ref={setNodeRef}
            className={cn(
                "rounded-[var(--r-4)] border border-border bg-[var(--bg)]/55 transition-all duration-150 [transition-timing-function:var(--ease-out)]",
                isOver && active && "border-[var(--ink-line)] bg-[var(--bg-elev)] shadow-[0_0_0_1px_var(--ink-line),0_18px_46px_-38px_rgba(0,0,0,0.95)]"
            )}
        >
            <header className="sticky top-0 z-10 rounded-t-[var(--r-4)] border-b border-border bg-[var(--bg)]/90 px-3 py-2.5 backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-foreground">{title}</h3>
                            <span className="rounded-[var(--r-2)] border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                                {count}
                            </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{description}</p>
                    </div>
                    {isOver && active ? (
                        <span className="rounded-[var(--r-2)] bg-primary px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-primary-foreground">
                            Drop
                        </span>
                    ) : action}
                </div>
            </header>
            <div className="flex flex-col gap-2 p-2.5">
                {children}
                {count === 0 && (
                    <div className="flex min-h-20 items-center justify-center rounded-[var(--r-3)] border border-dashed border-border bg-[var(--bg-soft)]/35 px-4 text-center text-xs leading-5 text-muted-foreground">
                        Drop a task here when it belongs in {title.toLowerCase()}.
                    </div>
                )}
            </div>
        </section>
    );
}
