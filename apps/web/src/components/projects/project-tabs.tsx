import React, { useState } from "react";
import {
    Settings,
    Archive,
    FolderPlus,
    MoreVertical,
    Trash2,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import {
    projectsStatsQueryOptions,
    goalsCountQueryOptions,
    journalsCountQueryOptions,
    useCreateProject,
    useUpdateProject,
    useDeleteProject,
    useArchiveProject,
} from "~/api/hooks";
import { CreateProjectDialog } from "./create-project-dialog";
import { EditProjectDialog } from "./edit-project-dialog";
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area";

type ProjectTabsProps = {
    activeProjectId: string | null;
    onProjectChange: (projectId: string | null) => void;
    layoutVersion: number;
    activeTab?: "Goals" | "Notes" | "Habits";
};

export const ProjectTabs: React.FC<ProjectTabsProps> = ({
    activeProjectId,
    onProjectChange,
    layoutVersion,
    activeTab = "Goals",
}) => {
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [editingProject, setEditingProject] = useState<any>(null);

    const { data: projects, isLoading: isLoadingProjects } = useQuery(
        projectsStatsQueryOptions()
    );

    const { mutateAsync: createProject, isPending: isCreatingProject } =
        useCreateProject();

    const { mutateAsync: updateProject, isPending: isUpdatingProject } =
        useUpdateProject();

    const { mutateAsync: deleteProject } = useDeleteProject();

    const { mutateAsync: archiveProject } = useArchiveProject();

    const { data: goalsCount } = useQuery(goalsCountQueryOptions());
    const { data: journalsCount } = useQuery(journalsCountQueryOptions());

    const handleCreateProject = async (project: any) => {
        await createProject(project);
        setIsCreateDialogOpen(false);
    };

    const handleUpdateProject = async (project: any) => {
        await updateProject(project);
        setEditingProject(null);
    };

    const handleDeleteProject = async (projectId: string) => {
        if (
            confirm(
                "Are you sure you want to delete this project? Goals and Notes in this project will be deleted."
            )
        ) {
            await deleteProject(projectId);
            if (activeProjectId) {
                onProjectChange(null);
            }
        }
    };

    const handleArchiveProject = async (projectId: string) => {
        if (
            confirm(
                "Are you sure you want to archive this project? Goals and Notes in this project will be archived."
            )
        ) {
            await archiveProject(projectId);
            if (activeProjectId) {
                onProjectChange(null);
            }
        }
    };

    const handleProjectSelect = (projectId: string | null) => {
        onProjectChange(projectId);
    };

    if (isLoadingProjects) {
        return (
            <div className="flex items-center gap-2">
                <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-200" />
                <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-200" />
            </div>
        );
    }

    return (
        <div className="flex items-start gap-2">
            <ScrollArea className="flex-1 group">
                <div className="flex items-center gap-2 min-w-fit pb-3">
                    <Button
                        variant={
                            activeProjectId === null ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => handleProjectSelect(null)}
                        className="whitespace-nowrap flex items-center gap-2"
                    >
                        All {activeTab}
                        {projects && (
                            <span className="text-xs opacity-70">
                                (
                                {activeTab === "Goals"
                                    ? ((goalsCount as any) ?? 0)
                                    : activeTab === "Notes"
                                      ? ((journalsCount as any) ?? 0)
                                      : ((goalsCount as any) ?? 0)}
                                )
                            </span>
                        )}
                    </Button>

                    {(projects as any[])?.map((project: any) => (
                        <div
                            key={project.id}
                            className="relative group flex items-center"
                        >
                            <Button
                                variant={
                                    activeProjectId === project.id
                                        ? "default"
                                        : "outline"
                                }
                                size="sm"
                                onClick={() => handleProjectSelect(project.id)}
                                className="whitespace-nowrap flex items-center gap-1"
                            >
                                <span>{project.name || "Unnamed Project"}</span>
                                <span className="text-xs opacity-70">
                                    (
                                    {activeTab === "Goals"
                                        ? project.goalStats?.total ?? 0
                                        : activeTab === "Notes"
                                          ? project.journalStats?.total || 0
                                          : (project.goalStats?.total ?? 0) +
                                            (project.journalStats?.total || 0)}
                                    )
                                </span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`h-6 w-6 p-0 transition-opacity -mr-3 focus-visible:ring-0 focus-visible:ring-offset-0 ${activeProjectId === project.id ? "hover:bg-transparent hover:text-primary-foreground" : ""}`}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <MoreVertical className="h-3 w-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align="center"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <DropdownMenuItem
                                            onClick={() =>
                                                setEditingProject(project)
                                            }
                                        >
                                            <Settings className="mr-2 h-4 w-4" />
                                            Edit Project
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() =>
                                                handleArchiveProject(project.id)
                                            }
                                            className="text-red-600"
                                        >
                                            <Archive className="mr-2 h-4 w-4" />
                                            Archive Project
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() =>
                                                handleDeleteProject(project.id)
                                            }
                                            className="text-red-600"
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Delete Project
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </Button>
                        </div>
                    ))}
                </div>
                <ScrollBar
                    orientation="horizontal"
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-0"
                />
            </ScrollArea>

            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateDialogOpen(true)}
                className="flex items-center gap-2 flex-shrink-0"
                disabled={isCreatingProject}
                title={layoutVersion === 1 ? "New Project" : undefined}
            >
                {layoutVersion === 2 && "New Project"}
                <FolderPlus className="h-4 w-4" />
            </Button>

            <CreateProjectDialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSave={handleCreateProject}
                onCancel={() => setIsCreateDialogOpen(false)}
            />

            {editingProject && (
                <EditProjectDialog
                    open={!!editingProject}
                    onOpenChange={(open) => !open && setEditingProject(null)}
                    project={editingProject}
                    onSave={handleUpdateProject}
                    onCancel={() => setEditingProject(null)}
                />
            )}
        </div>
    );
};
