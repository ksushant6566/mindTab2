import {
    DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, useSensor, useSensors, pointerWithin, CollisionDetection, rectIntersection,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { type CheckedState } from "@radix-ui/react-checkbox";
import React, { useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useUpdateGoalPositions } from "~/api/hooks";
import { DroppableColumn } from "./droppable-column";
import { Goal } from "./goal";
import { SortableGoal } from "./sortable-goal";
import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { ArchiveIcon, ChevronDownIcon, EyeOffIcon } from "lucide-react";

type TGoal = any;
type GoalStatus = "pending" | "in_progress" | "completed" | "archived";

interface KanbanGoalsProps {
    pendingGoals?: TGoal[]; inProgressGoals?: TGoal[]; completedGoals?: TGoal[]; archivedGoals?: TGoal[];
    onEdit: (id: string) => void; onDelete: (id: string) => void; onToggleStatus: (id: string, checked: CheckedState) => void;
    onArchiveCompleted?: () => void; onShowArchived?: () => void; showArchived?: boolean;
    isDeleting: boolean; deleteVariables?: { id: string };
}

export const KanbanGoals: React.FC<KanbanGoalsProps> = ({
    pendingGoals = [], inProgressGoals = [], completedGoals = [], archivedGoals = [],
    onEdit, onDelete, onToggleStatus, onArchiveCompleted, onShowArchived, showArchived = false, isDeleting, deleteVariables,
}) => {
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [localPendingGoals, setLocalPendingGoals] = React.useState<TGoal[]>([]);
    const [localInProgressGoals, setLocalInProgressGoals] = React.useState<TGoal[]>([]);
    const [localCompletedGoals, setLocalCompletedGoals] = React.useState<TGoal[]>([]);
    const [localArchivedGoals, setLocalArchivedGoals] = React.useState<TGoal[]>([]);
    const sequenceRef = useRef(0);

    useEffect(() => {
        setLocalPendingGoals(pendingGoals); setLocalInProgressGoals(inProgressGoals);
        setLocalCompletedGoals(completedGoals); setLocalArchivedGoals(archivedGoals);
    }, [pendingGoals, inProgressGoals, completedGoals, archivedGoals]);

    const { mutate: updatePositions } = useUpdateGoalPositions();

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));
    const handleDragStart = (event: DragStartEvent) => { setActiveId(event.active.id as string); };

    const findContainer = (id: string): GoalStatus | undefined => {
        if (id === "pending" || id === "in_progress" || id === "completed" || id === "archived") return id;
        const goal = [...localPendingGoals, ...localInProgressGoals, ...localCompletedGoals, ...localArchivedGoals].find((g) => g.id === id);
        return goal?.status;
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) { setActiveId(null); return; }
        const activeGoal = [...localPendingGoals, ...localInProgressGoals, ...localCompletedGoals, ...localArchivedGoals].find((g) => g.id === active.id);
        if (!activeGoal) { setActiveId(null); return; }
        const overContainer = findContainer(over.id as string);
        if (!overContainer) { setActiveId(null); return; }

        const getGoals = (status: string) => {
            if (status === "pending") return [...localPendingGoals];
            if (status === "in_progress") return [...localInProgressGoals];
            if (status === "completed") return [...localCompletedGoals];
            return [...localArchivedGoals];
        };
        const setGoals = (status: string, goals: TGoal[]) => {
            if (status === "pending") setLocalPendingGoals(goals);
            else if (status === "in_progress") setLocalInProgressGoals(goals);
            else if (status === "completed") setLocalCompletedGoals(goals);
            else setLocalArchivedGoals(goals);
        };

        const sourceGoals = getGoals(activeGoal.status);
        const destinationGoals = getGoals(overContainer);
        const oldIndex = sourceGoals.findIndex((g: any) => g.id === active.id);
        let newIndex = over.id === overContainer ? destinationGoals.length : destinationGoals.findIndex((g: any) => g.id === over.id);
        if (newIndex === -1) newIndex = destinationGoals.length;

        const isSameContainer = activeGoal.status === overContainer;
        const updates: { id: string; position: number; status: GoalStatus }[] = [];

        if (isSameContainer) {
            const reorderedGoals = arrayMove(sourceGoals, oldIndex, newIndex);
            reorderedGoals.forEach((goal: any, index: number) => { updates.push({ id: goal.id, position: index, status: goal.status }); });
            setGoals(overContainer, reorderedGoals);
        } else {
            sourceGoals.splice(oldIndex, 1);
            const updatedGoal = { ...activeGoal, status: overContainer };
            destinationGoals.splice(newIndex, 0, updatedGoal);
            sourceGoals.forEach((goal: any, index: number) => { updates.push({ id: goal.id, position: index, status: goal.status }); });
            destinationGoals.forEach((goal: any, index: number) => { updates.push({ id: goal.id, position: index, status: goal.id === activeGoal.id ? overContainer : goal.status }); });
            setGoals(activeGoal.status, sourceGoals);
            setGoals(overContainer, destinationGoals);
        }

        const sequence = ++sequenceRef.current;
        updatePositions({ goals: updates, sequence } as any);
        setActiveId(null);
    };

    const handleDragCancel = () => { setActiveId(null); };

    const activeGoal = React.useMemo(
        () => [...localPendingGoals, ...localInProgressGoals, ...localCompletedGoals, ...localArchivedGoals].find((g) => g.id === activeId),
        [activeId, localPendingGoals, localInProgressGoals, localCompletedGoals, localArchivedGoals]
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

    const renderGoals = (goals: TGoal[]) => goals.map((goal: any) => (
        <SortableGoal key={goal.id} goal={goal} onEdit={onEdit} onDelete={onDelete} onToggleStatus={onToggleStatus} isDeleting={isDeleting} deleteVariables={deleteVariables} />
    ));

    return (
        <DndContext sensors={sensors} collisionDetection={collisionDetectionStrategy} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
            <ScrollArea className="h-[calc(100vh-18rem)] overflow-y-auto relative w-full">
                <div className="grid gap-4 pb-12 pr-4 w-full min-w-[650px]" style={{ gridTemplateColumns: showArchived ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr" }}>
                    <DroppableColumn id="pending" title={<span>Pending{localPendingGoals.length > 0 && <span className="text-xs text-primary ml-2 border border-muted px-2 py-0.5 rounded-sm bg-muted">{localPendingGoals.length}</span>}</span>}>
                        <SortableContext items={localPendingGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>{renderGoals(localPendingGoals)}</SortableContext>
                    </DroppableColumn>
                    <DroppableColumn id="in_progress" title={<span>In Progress<span className="text-xs text-primary ml-2 border border-muted px-2 py-0.5 rounded-sm bg-muted">{localInProgressGoals.length}</span></span>}>
                        <SortableContext items={localInProgressGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>{renderGoals(localInProgressGoals)}</SortableContext>
                    </DroppableColumn>
                    <DroppableColumn id="completed" title={
                        <div className="flex items-center justify-between w-full">
                            <span className="flex items-center">Completed<span className="text-xs text-primary ml-2 border border-muted px-2 py-0.5 rounded-sm bg-muted">{localCompletedGoals.length}</span></span>
                            {localCompletedGoals.length > -1 && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild className="focus-visible:ring-0 focus-visible:ring-offset-0">
                                        <Button variant="ghost" size="sm" className="h-7 px-2 focus-visible:ring-0 focus-visible:ring-offset-0" title="Archive options">
                                            <ArchiveIcon className="h-4 w-4 mr-1" /><ChevronDownIcon className="h-3 w-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48 focus-visible:ring-0 focus-visible:ring-offset-0">
                                        <DropdownMenuItem onClick={onArchiveCompleted} className="cursor-pointer"><ArchiveIcon className="h-4 w-4 mr-2" />Archive completed</DropdownMenuItem>
                                        <DropdownMenuItem onClick={onShowArchived} className="cursor-pointer"><ArchiveIcon className="h-4 w-4 mr-2" />{showArchived ? "Hide archived" : "Show archived"}</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    }>
                        <SortableContext items={localCompletedGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>{renderGoals(localCompletedGoals)}</SortableContext>
                    </DroppableColumn>
                    {showArchived && (
                        <DroppableColumn id="archived" title={
                            <div className="flex items-center justify-between w-full">
                                <span className="flex items-center">Archived<span className="text-xs text-primary ml-2 border border-muted px-2 py-0.5 rounded-sm bg-muted">{localArchivedGoals.length}</span></span>
                                <TooltipProvider><Tooltip delayDuration={0}><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 px-2 focus-visible:ring-0 focus-visible:ring-offset-0" onClick={onShowArchived}><EyeOffIcon className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Hide archived goals</p></TooltipContent></Tooltip></TooltipProvider>
                            </div>
                        }>
                            <SortableContext items={localArchivedGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>{renderGoals(localArchivedGoals)}</SortableContext>
                        </DroppableColumn>
                    )}
                </div>
            </ScrollArea>
            <DragOverlay>
                {activeGoal ? (<div className="rounded-lg border bg-card p-4"><Goal goal={activeGoal} onEdit={onEdit} onDelete={onDelete} onToggleStatus={onToggleStatus} isDeleting={isDeleting} deleteVariables={deleteVariables} /></div>) : null}
            </DragOverlay>
        </DndContext>
    );
};
