import React, { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { handleCmdEnterSubmit } from "~/lib/utils";

type CreateProjectDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (project: any) => Promise<void>;
    onCancel: () => void;
};

export const CreateProjectDialog: React.FC<CreateProjectDialogProps> = ({
    open,
    onOpenChange,
    onSave,
    onCancel,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        status: "active",
        startDate: new Date().toISOString().split("T")[0],
        endDate: undefined as string | undefined,
    });

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]:
                value === "" ? (name === "endDate" ? undefined : "") : value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onSave(formData);
            setFormData({
                name: "",
                description: "",
                status: "active",
                startDate: new Date().toISOString().split("T")[0],
                endDate: undefined,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => {
        setFormData({
            name: "",
            description: "",
            status: "active",
            startDate: new Date().toISOString().split("T")[0],
            endDate: undefined,
        });
        onCancel();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create New Project</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} onKeyDown={handleCmdEnterSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Project Name</Label>
                        <Input
                            id="name"
                            name="name"
                            placeholder="Enter project name"
                            value={formData.name || ""}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            name="description"
                            placeholder="Enter project description (optional)"
                            value={formData.description || ""}
                            onChange={handleChange}
                            rows={3}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCancel}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={isSubmitting || !formData.name}
                            loading={isSubmitting}
                        >
                            Create Project
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
