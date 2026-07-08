import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Clock } from "~/components/clock";
import { LoadingState } from "~/components/patterns";
import { useAppStore, EActiveLayout } from "@mindtab/core";
import type { ActiveLayout } from "@mindtab/core";
import { TodayEventsPanel } from "~/components/domain/calendar/today-events-panel";

const Tasks = React.lazy(() =>
    import("~/components/domain/tasks/tasks").then((module) => ({ default: module.Tasks }))
);
const Notes = React.lazy(() =>
    import("~/components/domain/notes/notes").then((module) => ({ default: module.Notes }))
);
const Calendar = React.lazy(() =>
    import("~/components/domain/calendar/calendar").then((module) => ({ default: module.Calendar }))
);

const getDashboardLayout = () => ({
    container: {
        style: "w-full max-w-screen-xl",
    },
    col1: {
        elements: [
            {
                element: <Tasks viewMode={"kanban"} />,
                title: EActiveLayout.Tasks as ActiveLayout,
            },
            {
                element: <Calendar />,
                title: EActiveLayout.Calendar as ActiveLayout,
            },
            {
                element: <Notes />,
                title: EActiveLayout.Notes as ActiveLayout,
            },
        ],
        style: "col-span-8",
    },
    col2: {
        elements: [
            {
                element: <TodayEventsPanel />,
                title: EActiveLayout.Calendar as ActiveLayout,
            },
        ],
        style: "col-span-2",
    },
    activeColumn: "col1",
});

const DashboardPanelFallback = () => (
    <LoadingState className="min-h-0 flex-1" label="Loading" />
);

export default function Component() {
    const [isHydrated, setIsHydrated] = useState(false);
    const [visitedCol1Elements, setVisitedCol1Elements] = useState<Set<ActiveLayout>>(
        () => new Set([EActiveLayout.Tasks as ActiveLayout])
    );

    const {
        activeElement,
        setActiveElement: setStoreActiveElement,
    } = useAppStore();

    const layout = useMemo(() => getDashboardLayout(), []);
    const isCalendarActive = activeElement === EActiveLayout.Calendar;
    const activeCol1Element =
        layout.col1.elements.find((element) => element.title === activeElement) ??
        layout.col1.elements[0]!;

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    useEffect(() => {
        setVisitedCol1Elements((visited) => {
            if (visited.has(activeCol1Element.title)) return visited;
            return new Set(visited).add(activeCol1Element.title);
        });
    }, [activeCol1Element.title]);

    // Initialize activeElement if missing or left over from retired layouts.
    useEffect(() => {
        const activeColumn = layout[layout.activeColumn as "col1" | "col2"];
        const defaultElement = activeColumn.elements[0]!.title;
        if (!activeColumn.elements.some(({ title }) => title === activeElement)) {
            setStoreActiveElement(defaultElement);
        }
    }, [activeElement, layout, setStoreActiveElement]);

    const handleActiveElementChange = (newActiveElement: ActiveLayout) => {
        setStoreActiveElement(newActiveElement);
    };

    if (!isHydrated) return null;

    return (
        <div
            className={`relative flex h-full min-h-0 flex-col gap-2 transition-all duration-150 ease-out ${layout.container.style}`}
        >
            <div
                className="grid h-full min-h-0 w-full grid-cols-10 gap-4"
                style={{ gridTemplateRows: "auto minmax(0, 1fr)" }}
            >
                <div className="flex justify-between items-center col-span-10">
                    <Clock />
                    <div className="flex flex-row gap-8">
                        <div className="flex gap-2">
                            {layout[layout.activeColumn as "col1" | "col2"].elements
                                .filter((element) => element.title !== EActiveLayout.Calendar)
                                .map((element) => (
                                <Button
                                    key={element.title}
                                    size={"sm"}
                                    onClick={() =>
                                        handleActiveElementChange(element.title)
                                    }
                                    variant={
                                        activeElement === element.title
                                            ? "default"
                                            : "secondary"
                                    }
                                >
                                    {element.title}
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className={`${isCalendarActive ? "col-span-10" : layout.col1.style} flex min-h-0 min-w-0 flex-col`}>
                    {layout.col1.elements.map((element) => {
                        if (!visitedCol1Elements.has(element.title)) return null;

                        const isActive = activeCol1Element.title === element.title;
                        return (
                            <div
                                className={isActive ? "flex min-h-0 flex-1 flex-col" : "hidden"}
                                key={element.title}
                            >
                                <Suspense fallback={<DashboardPanelFallback />}>
                                    {element.title === EActiveLayout.Calendar
                                        ? React.cloneElement(element.element, { isActive: isCalendarActive })
                                        : element.element}
                                </Suspense>
                            </div>
                        );
                    })}
                </div>
                <div className={`${layout.col2.style} ${isCalendarActive ? "hidden" : "flex"} min-h-0 min-w-0 flex-col`}>
                    <Suspense fallback={<DashboardPanelFallback />}>
                        {layout.col2.elements[0]?.element}
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
