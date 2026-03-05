import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "~/components/ui/select";
import { FolderOpen } from "lucide-react";
import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { TipTapEditor } from "~/components/text-editor/index";
import { useQuery } from "@tanstack/react-query";
import { projectsQueryOptions, useCreateJournal } from "~/api/hooks";

type TCreateJournalDialogProps = {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    activeProjectId?: string | null;
};

export const CreateJournalDialog = ({
    isOpen,
    onOpenChange,
    activeProjectId,
}: TCreateJournalDialogProps) => {
    const { data: projects } = useQuery(projectsQueryOptions());

    const [info, setInfo] = useState({
        title: "",
        content: "",
        projectId: activeProjectId || null,
    });

    const createJournalMutation = useCreateJournal();
    const isCreatingJournal = createJournalMutation.isPending;
    const createJournal = (values: any) => {
        createJournalMutation.mutate(values, {
            onSuccess: () => {
                onOpenChange(false);
                setInfo({
                    title: "",
                    content: "",
                    projectId: activeProjectId || null,
                });
            },
            onError: (error: any) => {
                toast.error(error.message || "Failed to create note");
            },
        });
    };

    useEffect(() => {
        if (isOpen) {
            setInfo({
                title: "",
                content: "",
                projectId: activeProjectId || null,
            });
        }
    }, [isOpen, activeProjectId]);

    const handleSubmit = () => {
        const journalData = {
            title: info.title,
            content: info.content,
            ...(info.projectId && { projectId: info.projectId }),
        };
        createJournal(journalData as any);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[1000px]">
                <DialogTitle>Create new note</DialogTitle>
                <DialogDescription className="-mt-2">
                    Create a new note.
                </DialogDescription>

                <div className="flex gap-2 pb-2">
                    <Select
                        onValueChange={(value) =>
                            setInfo({
                                ...info,
                                projectId: value === "none" ? null : value,
                            })
                        }
                        value={info.projectId || "none"}
                    >
                        <SelectTrigger className="w-fit focus:ring-0">
                            <SelectValue placeholder="Project">
                                <span className="flex items-center gap-1 text-sm">
                                    <FolderOpen className="h-4 w-4" />
                                    {info.projectId
                                        ? (projects as any[])?.find(
                                              (p: any) => p.id === info.projectId
                                          )?.name || "Project"
                                        : "No Project"}
                                </span>
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="text-sm">
                            <SelectGroup>
                                <SelectLabel>Project</SelectLabel>
                                <SelectItem value="none">
                                    <span className="flex items-center gap-2 text-sm">
                                        No Project
                                    </span>
                                </SelectItem>
                                {(projects as any[])?.map((project: any) => (
                                    <SelectItem
                                        key={project.id}
                                        value={project.id}
                                    >
                                        <span className="flex items-center gap-2 text-sm">
                                            <FolderOpen className="h-4 w-4" />
                                            {project.name || "Unnamed Project"}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </div>

                <div className="border border-input rounded-lg overflow-y-auto overflow-x-visible max-h-[calc(100vh-18rem)] p-1">
                    <TipTapEditor
                        content={info.content}
                        onContentChange={(content) =>
                            setInfo({ ...info, content })
                        }
                        title={info.title}
                        onTitleChange={(title) => setInfo({ ...info, title })}
                        editable={true}
                    />
                </div>
                <DialogFooter>
                    <Button
                        onClick={() => onOpenChange(false)}
                        size={"sm"}
                        variant="outline"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        size={"sm"}
                        disabled={
                            isCreatingJournal || !info.title || !info.content
                        }
                    >
                        {isCreatingJournal ? "Creating..." : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
