import React, { useEffect, useMemo, useState } from "react";
import { Tasks } from "./tasks/index";
import { Habits } from "./habits";
import { Notes } from "./notes/notes";
import { Calendar } from "./calendar/calendar";
import { Button } from "~/components/ui/button";
import { Clock } from "./clock";
import { ProjectTabs } from "./projects";
import { useAppStore, EActiveLayout } from "@mindtab/core";
import type { ActiveLayout } from "@mindtab/core";
import { cn } from "~/lib/utils";

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
                element: <Habits viewMode={"cards"} />,
                title: EActiveLayout.Habits as ActiveLayout,
            },
        ],
        style: "col-span-2",
    },
    activeColumn: "col1",
});

export default function Component() {
    const [isHydrated, setIsHydrated] = useState(false);

    const {
        activeElement,
        activeProjectId,
        setActiveElement: setStoreActiveElement,
        setActiveProjectId: setStoreActiveProjectId,
    } = useAppStore();

    const layout = useMemo(() => getDashboardLayout(), []);
    const isCalendarActive = activeElement === EActiveLayout.Calendar;

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    // Initialize activeElement if missing or left over from the retired layout.
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
            <div className="grid h-full min-h-0 w-full grid-cols-10 grid-rows-[auto_minmax(0,1fr)] gap-4">
                <div className="flex justify-between items-center col-span-10">
                    <Clock />
                    <div className="flex flex-row gap-8">
                        <div className="flex gap-2">
                            {layout[
                                layout.activeColumn as "col1" | "col2"
                            ].elements.map((element) => (
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
                    {/* Project Tabs */}
                    <div className="-ml-0.5 shrink-0">
                        <ProjectTabs
                            activeProjectId={activeProjectId}
                            onProjectChange={setStoreActiveProjectId}
                            layoutVersion={2}
                            activeTab={activeElement as any}
                        />
                    </div>
                    {layout.col1.elements.map((element, index) => (
                        <div
                            className={cn(
                                "w-full",
                                layout.activeColumn === "col1" && activeElement !== element.title
                                    ? "hidden"
                                    : "flex min-h-0 flex-1 flex-col"
                            )}
                            key={index}
                        >
                            {element.element}
                        </div>
                    ))}
                </div>
                <div className={`${layout.col2.style} ${isCalendarActive ? "hidden" : "flex"} min-h-0 min-w-0 flex-col`}>
                    {layout.col2.elements.map((element, index) => (
                        <div
                            className={cn(
                                "w-full",
                                layout.activeColumn === "col2" && activeElement !== element.title
                                    ? "hidden"
                                    : "flex min-h-0 flex-1 flex-col"
                            )}
                            key={index}
                        >
                            {element.element}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
