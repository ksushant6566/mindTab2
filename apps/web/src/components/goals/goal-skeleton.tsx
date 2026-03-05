import React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "~/components/ui/accordion";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import { type ViewMode } from ".";

type GoalSkeletonProps = { viewMode: ViewMode; };

export const GoalSkeleton: React.FC<GoalSkeletonProps> = ({ viewMode }) => {
    if (viewMode === "list") {
        return (
            <Accordion type="single" collapsible defaultValue="pending" className="mt-4 pr-8">
                <AccordionItem value="pending">
                    <AccordionTrigger className="text-sm font-medium">Pending</AccordionTrigger>
                    <AccordionContent className="space-y-6">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div className="flex items-start justify-start gap-3" key={index}>
                                <div className="flex items-start justify-start"><Skeleton className="h-6 w-6 rounded-full" /></div>
                                <div className="flex flex-col gap-2 pt-0.5">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-8 w-64" />
                                    <div className="flex items-center gap-1">
                                        <Skeleton className="h-4 w-12 rounded-full" />
                                        <Skeleton className="h-4 w-12 rounded-full" />
                                        <Skeleton className="h-4 w-12 rounded-full" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        );
    }
    return (
        <ScrollArea className="h-[calc(100vh-18rem)] overflow-y-auto relative w-full mt-8">
            <div className="grid gap-4 pb-12 pr-4 w-full min-w-[650px]" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                {["pending", "progress", "completed"].map((col) => (
                    <div key={col} className="flex flex-col gap-3">
                        <div className="space-y-3">
                            {Array.from({ length: col === "completed" ? 2 : col === "progress" ? 3 : 4 }).map((_, index) => (
                                <div key={`${col}-${index}`} className="bg-card border rounded-lg p-4 space-y-3">
                                    <div className="flex items-start gap-3">
                                        <Skeleton className="h-5 w-5 rounded-sm" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-full" />
                                            <Skeleton className="h-3 w-3/4" />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Skeleton className="h-5 w-12 rounded-full" />
                                        <Skeleton className="h-5 w-16 rounded-full" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </ScrollArea>
    );
};
