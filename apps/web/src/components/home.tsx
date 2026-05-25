import React, { useEffect, useState } from "react";
import { Tasks } from "./tasks/index";
import { Habits } from "./habits";
import { Notes } from "./notes/notes";
import { Button } from "~/components/ui/button";
import { LayoutGrid, List } from "lucide-react";
import { Clock } from "./clock";
import { ProjectTabs } from "./projects";
import { useAppStore, EActiveLayout } from "@mindtab/core";
import type { ActiveLayout } from "@mindtab/core";
import { cn } from "~/lib/utils";

const getLayout1 = (_activeProjectId: string | null) => ({
    container: {
        style: "max-w-screen-lg",
    },
    col1: {
        elements: [
            {
                element: <Tasks viewMode={"list"} />,
                title: EActiveLayout.Tasks as ActiveLayout,
            },
        ],
        style: "col-span-4",
    },
    col2: {
        elements: [
            {
                element: <Habits viewMode={"table"} />,
                title: EActiveLayout.Habits as ActiveLayout,
            },
            {
                element: <Notes />,
                title: EActiveLayout.Notes as ActiveLayout,
            },
        ],
        style: "col-span-6",
    },
    activeColumn: "col2",
});

const getLayout2 = (_activeProjectId: string | null) => ({
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
        layoutVersion,
        activeElement,
        activeProjectId,
        setLayoutVersion: setStoreLayoutVersion,
        setActiveElement: setStoreActiveElement,
        setActiveProjectId: setStoreActiveProjectId,
    } = useAppStore();

    const layout =
        layoutVersion === 1
            ? getLayout1(activeProjectId)
            : getLayout2(activeProjectId);

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    // Initialize activeElement if not set, based on the current layout
    useEffect(() => {
        if (!activeElement) {
            const defaultElement =
                layout[layout.activeColumn as "col1" | "col2"].elements[0]!
                    .title;
            setStoreActiveElement(defaultElement);
        }
    }, [activeElement, layout, setStoreActiveElement]);

    const handleLayoutVersionChange = (newLayoutVersion: number) => {
        setStoreLayoutVersion(newLayoutVersion);

        const activeLayout =
            newLayoutVersion === 1
                ? getLayout1(activeProjectId)
                : getLayout2(activeProjectId);
        const activeColumn =
            activeLayout[activeLayout.activeColumn as "col1" | "col2"];

        if (
            activeColumn.elements.some(({ title }) => title === activeElement)
        ) {
            return;
        }

        handleActiveElementChange(activeColumn.elements[0]!.title);
    };

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
                        <div className="flex gap-2">
                            <Button
                                variant={
                                    layoutVersion === 1
                                        ? "default"
                                        : "secondary"
                                }
                                size="sm"
                                onClick={() => handleLayoutVersionChange(1)}
                            >
                                <List className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={
                                    layoutVersion === 2
                                        ? "default"
                                        : "secondary"
                                }
                                size="sm"
                                onClick={() => handleLayoutVersionChange(2)}
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
                <div className={`${layout.col1.style} flex min-h-0 min-w-0 flex-col`}>
                    {/* Project Tabs */}
                    <div className="-ml-0.5 shrink-0">
                        <ProjectTabs
                            activeProjectId={activeProjectId}
                            onProjectChange={setStoreActiveProjectId}
                            layoutVersion={layoutVersion}
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
                <div className={`${layout.col2.style} flex min-h-0 min-w-0 flex-col`}>
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
