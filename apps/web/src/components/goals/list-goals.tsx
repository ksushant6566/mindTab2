import {
    DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable, pointerWithin, CollisionDetection, rectIntersection,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { type CheckedState } from "@radix-ui/react-checkbox";
import React, { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useUpdateGoalPositions } from "~/api/hooks";
import { Goal } from "./goal";
import { SortableGoal } from "./sortable-goal";
import { Button } from "~/components/ui/button";
import { ArchiveIcon } from "lucide-react";
import { cn } from "~/lib/utils";

type TGoal = any;
type GoalStatus = "pending" | "in_progress" | "completed" | "archived";

interface ListGoalsProps {
    pendingGoals?: TGoal[];
    inProgressGoals?: TGoal[];
    completedGoals?: TGoal[];
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onToggleStatus: (id: string, checked: CheckedState) => void;
    onUpdate?: (id: string, goal: Record<string, unknown>) => void;
    onArchiveCompleted?: () => void;
    isDeleting: boolean;
    deleteVariables?: string;
}

export const ListGoals: React.FC<ListGoalsProps> = ({
    pendingGoals = [], inProgressGoals = [], completedGoals = [],
    onEdit, onDelete, onToggleStatus, onUpdate, onArchiveCompleted, isDeleting, deleteVariables,
}) => {
    const qc = useQueryClient();
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [localPendingGoals, setLocalPendingGoals] = React.useState<TGoal[]>([]);
    const [localInProgressGoals, setLocalInProgressGoals] = React.useState<TGoal[]>([]);
    const [localCompletedGoals, setLocalCompletedGoals] = React.useState<TGoal[]>([]);
    const sequenceRef = useRef(0);

    useEffect(() => {
        setLocalPendingGoals(pendingGoals);
        setLocalInProgressGoals(inProgressGoals);
        setLocalCompletedGoals(completedGoals);
    }, [pendingGoals, inProgressGoals, completedGoals]);

    const { mutate: updatePositions } = useUpdateGoalPositions();

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor)
    );

    const handleDragStart = (event: DragStartEvent) => { setActiveId(event.active.id as string); };

    const findContainer = (id: string) => {
        if (id === "pending" || id === "in_progress" || id === "completed") return id;
        const goal = [...localPendingGoals, ...localInProgressGoals, ...localCompletedGoals].find((goal) => goal.id === id);
        return goal?.status;
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) { setActiveId(null); return; }
        const activeGoal = [...localPendingGoals, ...localInProgressGoals, ...localCompletedGoals].find((goal) => goal.id === active.id);
        if (!activeGoal) { setActiveId(null); return; }
        const overContainer = findContainer(over.id as string);
        if (!overContainer) { setActiveId(null); return; }

        let sourceGoals: TGoal[];
        let destinationGoals: TGoal[];
        if (activeGoal.status === "pending") sourceGoals = [...localPendingGoals];
        else if (activeGoal.status === "in_progress") sourceGoals = [...localInProgressGoals];
        else sourceGoals = [...localCompletedGoals];
        if (overContainer === "pending") destinationGoals = [...localPendingGoals];
        else if (overContainer === "in_progress") destinationGoals = [...localInProgressGoals];
        else destinationGoals = [...localCompletedGoals];

        const oldIndex = sourceGoals.findIndex((g: any) => g.id === active.id);
        let newIndex = over.id === overContainer ? destinationGoals.length : destinationGoals.findIndex((g: any) => g.id === over.id);
        if (newIndex === -1) newIndex = destinationGoals.length;
        const isSameContainer = activeGoal.status === overContainer;
        const updates: { id: string; position: number; status: GoalStatus }[] = [];

        if (isSameContainer) {
            const reorderedGoals = arrayMove(sourceGoals, oldIndex, newIndex);
            reorderedGoals.forEach((goal: any, index: number) => { updates.push({ id: goal.id, position: index, status: goal.status }); });
            if (overContainer === "pending") setLocalPendingGoals(reorderedGoals);
            else if (overContainer === "in_progress") setLocalInProgressGoals(reorderedGoals);
            else setLocalCompletedGoals(reorderedGoals);
        } else {
            sourceGoals.splice(oldIndex, 1);
            const updatedGoal = { ...activeGoal, status: overContainer };
            destinationGoals.splice(newIndex, 0, updatedGoal);
            sourceGoals.forEach((goal: any, index: number) => { updates.push({ id: goal.id, position: index, status: goal.status }); });
            destinationGoals.forEach((goal: any, index: number) => { updates.push({ id: goal.id, position: index, status: goal.id === activeGoal.id ? overContainer : goal.status }); });
            if (activeGoal.status === "pending") setLocalPendingGoals(sourceGoals);
            else if (activeGoal.status === "in_progress") setLocalInProgressGoals(sourceGoals);
            else setLocalCompletedGoals(sourceGoals);
            if (overContainer === "pending") setLocalPendingGoals(destinationGoals);
            else if (overContainer === "in_progress") setLocalInProgressGoals(destinationGoals);
            else setLocalCompletedGoals(destinationGoals);
        }

        const sequence = ++sequenceRef.current;
        updatePositions(
            { goals: updates, sequence } as any,
            {
                onError: (_err: any, _vars: any, context: any) => {
                    if (context?.sequence === sequenceRef.current) {
                        setLocalPendingGoals(pendingGoals);
                        setLocalInProgressGoals(inProgressGoals);
                        setLocalCompletedGoals(completedGoals);
                        context?.previousGoals?.forEach(([key, data]: any) => qc.setQueryData(key, data));
                    }
                },
                onSettled: (_data: any, _err: any, _vars: any, context: any) => {
                    if (context?.sequence === sequenceRef.current) {
                        qc.invalidateQueries({ queryKey: ["goals"] });
                    }
                },
            }
        );
        setActiveId(null);
    };

    const handleDragCancel = () => { setActiveId(null); };

    const activeGoal = React.useMemo(
        () => [...localPendingGoals, ...localInProgressGoals, ...localCompletedGoals].find((goal) => goal.id === activeId),
        [activeId, localPendingGoals, localInProgressGoals, localCompletedGoals]
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

    const renderGoals = (goals: TGoal[]) => goals.map((goal: any) => (
        <SortableGoal
            key={goal.id}
            goal={goal}
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
                    <ListGoalSection id="pending" title="To Do" count={localPendingGoals.length} description="Queued, clarified, ready to pull">
                        <SortableContext items={localPendingGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>
                            {renderGoals(localPendingGoals)}
                        </SortableContext>
                    </ListGoalSection>
                    <ListGoalSection id="in_progress" title="In Progress" count={localInProgressGoals.length} description="Active commitments, limited by focus">
                        <SortableContext items={localInProgressGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>
                            {renderGoals(localInProgressGoals)}
                        </SortableContext>
                    </ListGoalSection>
                    <ListGoalSection
                        id="completed"
                        title="Done"
                        count={localCompletedGoals.length}
                        description="Finished work waiting to be cleared"
                        action={
                            localCompletedGoals.length > 0 && onArchiveCompleted ? (
                                <Button variant="ghost" size="sm" className="h-7 rounded-[var(--r-2)] px-2" onClick={onArchiveCompleted} title="Archive all completed">
                                    <ArchiveIcon className="mr-1.5 h-3.5 w-3.5" />
                                    Archive
                                </Button>
                            ) : null
                        }
                    >
                        <SortableContext items={localCompletedGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>
                            {renderGoals(localCompletedGoals)}
                        </SortableContext>
                    </ListGoalSection>
                </div>
            </ScrollArea>
            <DragOverlay>
                {activeGoal ? (
                    <div className="w-full max-w-2xl">
                        <Goal
                            goal={activeGoal}
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

function ListGoalSection({
    id,
    title,
    count,
    description,
    action,
    children,
}: {
    id: GoalStatus;
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
                        Drop a goal here when it belongs in {title.toLowerCase()}.
                    </div>
                )}
            </div>
        </section>
    );
}
