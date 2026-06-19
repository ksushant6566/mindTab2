import React from "react";
import { TaskForm } from "./task-form";

export type EditTaskProps = {
    onSave: (task: any) => void;
    onCancel: () => void;
    task: any;
    loading?: boolean;
};

export const EditTask: React.FC<EditTaskProps> = ({ onSave, onCancel, task, loading = false }) => {
    return (
        <TaskForm
            mode="edit"
            task={task}
            onSave={onSave}
            onCancel={onCancel}
            loading={loading}
            showHeader
        />
    );
};
