import React from "react";
import { TaskForm } from "./task-form";

export type CreateTaskProps = {
    onSave: (task: any) => void;
    onCancel: () => void;
    defaultValues?: Partial<any>;
    loading?: boolean;
};

export const CreateTask: React.FC<CreateTaskProps> = ({
    onSave,
    onCancel,
    defaultValues,
    loading,
}) => {
    return (
        <TaskForm
            mode="create"
            onSave={onSave}
            onCancel={onCancel}
            defaultValues={defaultValues}
            loading={loading}
            showHeader
        />
    );
};
