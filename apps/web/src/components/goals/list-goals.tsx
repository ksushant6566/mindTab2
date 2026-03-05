import {
    DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { type CheckedState } from "@radix-ui/react-checkbox";
import React, { useEffect, useRef } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "~/components/ui/accordion";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useUpdateGoalPositions } from "~/api/hooks";
import { Goal } from "./goal";
import { SortableGoal } from "./sortable-goal";
import { Button } from "~/components/ui/button";
import { ArchiveIcon } from "lucide-react";

type TGoal = any;
type GoalStatus = "pending" | "in_progress" | "completed" | "archived";

interface ListGoalsProps {
    pendingGoals?: TGoal[];
    inProgressGoals?: TGoal[];
    completedGoals?: TGoal[];
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onToggleStatus: (id: string, checked: CheckedState) => void;
    onArchiveCompleted?: () => void;
    isDeleting: boolean;
    deleteVariables?: { id: string };
}

export const ListGoals: React.FC<ListGoalsProps> = ({
    pendingGoals = [], inProgressGoals = [], completedGoals = [],
    onEdit, onDelete, onToggleStatus, onArchiveCompleted, isDeleting, deleteVariables,
}) => {
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
        const newIndex = over.id === overContainer ? destinationGoals.length : destinationGoals.findIndex((g: any) => g.id === over.id);
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
        updatePositions({ goals: updates, sequence } as any);
        setActiveId(null);
    };

    const handleDragCancel = () => { setActiveId(null); };

    const activeGoal = React.useMemo(
        () => [...localPendingGoals, ...localInProgressGoals, ...localCompletedGoals].find((goal) => goal.id === activeId),
        [activeId, localPendingGoals, localInProgressGoals, localCompletedGoals]
    );

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
            <ScrollArea className="h-[calc(100vh-18rem)] overflow-y-auto relative">
                <div className="flex flex-col gap-0 pr-4 pb-12">
                    <Accordion type="single" collapsible defaultValue="pending">
                        <AccordionItem value="pending">
                            <AccordionTrigger className="text-sm font-medium pt-0">
                                <span>Pending<span className="text-xs text-primary ml-2 border border-muted px-2 py-0.5 rounded-sm bg-muted">{localPendingGoals.length}</span></span>
                            </AccordionTrigger>
                            <AccordionContent className="space-y-4">
                                <SortableContext items={localPendingGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>
                                    {localPendingGoals.map((goal: any) => (<SortableGoal key={goal.id} goal={goal} onEdit={onEdit} onDelete={onDelete} onToggleStatus={onToggleStatus} isDeleting={isDeleting} deleteVariables={deleteVariables} />))}
                                </SortableContext>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                    <Accordion type="single" collapsible defaultValue={localPendingGoals.length ? undefined : "in_progress"}>
                        <AccordionItem value="in_progress">
                            <AccordionTrigger className="text-sm font-medium">
                                <span>In Progress<span className="text-xs text-primary ml-2 border border-muted px-2 py-0.5 rounded-sm bg-muted">{inProgressGoals.length}</span></span>
                            </AccordionTrigger>
                            <AccordionContent className="space-y-6">
                                <SortableContext items={localInProgressGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>
                                    {localInProgressGoals.map((goal: any) => (<SortableGoal key={goal.id} goal={goal} onEdit={onEdit} onDelete={onDelete} onToggleStatus={onToggleStatus} isDeleting={isDeleting} deleteVariables={deleteVariables} />))}
                                </SortableContext>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                    <Accordion type="single" collapsible defaultValue={localPendingGoals.length ? undefined : "completed"}>
                        <AccordionItem value="completed">
                            <AccordionTrigger className="text-sm font-medium">
                                <div className="flex items-center justify-between w-full">
                                    <span className="flex items-center">Completed<span className="text-xs text-primary ml-2 border border-muted px-2 py-0.5 rounded-sm bg-muted">{completedGoals.length}</span></span>
                                    {localCompletedGoals.length > 0 && onArchiveCompleted && (
                                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); onArchiveCompleted(); }} title="Archive all completed">
                                            <ArchiveIcon className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="space-y-6">
                                <SortableContext items={localCompletedGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>
                                    {localCompletedGoals.map((goal: any) => (<SortableGoal key={goal.id} goal={goal} onEdit={onEdit} onDelete={onDelete} onToggleStatus={onToggleStatus} isDeleting={isDeleting} deleteVariables={deleteVariables} />))}
                                </SortableContext>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            </ScrollArea>
            <DragOverlay>
                {activeGoal ? (<div className="rounded-lg border bg-card p-4"><Goal goal={activeGoal} onEdit={onEdit} onDelete={onDelete} onToggleStatus={onToggleStatus} isDeleting={isDeleting} deleteVariables={deleteVariables} /></div>) : null}
            </DragOverlay>
        </DndContext>
    );
};
