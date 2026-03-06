import { Flag, Zap, FolderOpen } from "lucide-react";
import React from "react";
import { Button } from "~/components/ui/button";
import { handleCmdEnterSubmit } from "~/lib/utils";
import {
    Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "~/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { projectsQueryOptions } from "~/api/hooks";
import { GOAL_PRIORITY, GOAL_IMPACT } from "@mindtab/shared";

const priorityColors = { priority_1: "red", priority_2: "yellow", priority_3: "green", priority_4: "white" };
const impactNumber = { low: 1, medium: 2, high: 3 };

export type EditGoalProps = {
    onSave: (goal: any) => void;
    onCancel: () => void;
    goal: any;
    loading?: boolean;
};

export const EditGoal: React.FC<EditGoalProps> = ({ onSave, onCancel, goal, loading = false }) => {
    const { data: projects } = useQuery(projectsQueryOptions());

    const [formData, setFormData] = React.useState<any>({
        id: goal.id, title: goal.title, description: goal.description,
        priority: goal.priority, impact: goal.impact, status: goal.status, projectId: goal.projectId,
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev: any) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); };

    return (
        <form onSubmit={handleSubmit} onKeyDown={handleCmdEnterSubmit} className="flex flex-col gap-2 rounded-lg border p-6">
            <div className="space-y-2">
                <input type="text" id="title" name="title" placeholder="Goal name" value={formData.title || ""} onChange={handleChange} required className="w-full bg-inherit text-xl font-semibold focus:border-none focus:outline-none" />
                <textarea id="description" name="description" placeholder="Description" value={formData.description || ""} onChange={handleChange} className="w-full resize-none overflow-hidden bg-inherit text-base font-normal focus:border-none focus:outline-none" style={{ height: "auto" }} onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = "auto"; target.style.height = `${target.scrollHeight}px`; }} />
            </div>
            <div className="flex gap-2 pb-2">
                <Select onValueChange={(value) => setFormData({ ...formData, priority: value })} value={formData.priority}>
                    <SelectTrigger className="size-8 w-[90px] focus:ring-0">
                        <SelectValue placeholder="Priority">
                            <span className="flex items-center gap-2 capitalize">
                                <Flag className="h-4 w-4" color={priorityColors[formData.priority as keyof typeof priorityColors]} fill={priorityColors[formData.priority as keyof typeof priorityColors]} />
                                P{formData.priority?.split("_")[1]}
                            </span>
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="text-sm"><SelectGroup>
                        {GOAL_PRIORITY.map((value) => (<SelectItem key={value} value={value}><span className="flex items-center gap-2 capitalize"><Flag className="h-4 w-4" color={priorityColors[value]} fill={priorityColors[value]} />{value.replace("_", " ")}</span></SelectItem>))}
                    </SelectGroup></SelectContent>
                </Select>
                <Select onValueChange={(value) => setFormData({ ...formData, impact: value })} value={formData.impact}>
                    <SelectTrigger className="size-8 w-fit focus:ring-0">
                        <SelectValue placeholder="Impact">
                            <span className="flex items-center gap-0 capitalize">
                                {Array.from({ length: impactNumber[formData.impact as keyof typeof impactNumber] }).map((_, i) => (<Zap key={i} className="h-3 w-3" color="gold" fill="gold" />))}
                            </span>
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="text-sm"><SelectGroup><SelectLabel>Impact</SelectLabel>
                        {[...GOAL_IMPACT].reverse().map((value) => (<SelectItem key={value} value={value}><span className="flex items-center gap-0 capitalize"><span className="mr-1 text-sm">{value}</span>{Array.from({ length: impactNumber[value] }).map((_, i) => (<Zap key={i} className="h-3 w-3" color="gold" fill="gold" />))}</span></SelectItem>))}
                    </SelectGroup></SelectContent>
                </Select>
                <Select onValueChange={(value) => setFormData({ ...formData, projectId: value === "none" ? null : value })} value={formData.projectId || "none"}>
                    <SelectTrigger className="size-8 w-fit focus:ring-0">
                        <SelectValue placeholder="Project">
                            <span className="flex items-center gap-1 text-xs"><FolderOpen className="h-3 w-3" />{formData.projectId ? (projects as any[])?.find((p: any) => p.id === formData.projectId)?.name?.substring(0, 10) || "Project" : "No Project"}</span>
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="text-sm"><SelectGroup><SelectLabel>Project</SelectLabel>
                        <SelectItem value="none"><span className="flex items-center gap-2 text-xs">No Project</span></SelectItem>
                        {(projects as any[])?.map((project: any) => (<SelectItem key={project.id} value={project.id}><span className="flex items-center gap-2 text-xs"><FolderOpen className="h-3 w-3" />{project.name || "Unnamed Project"}</span></SelectItem>))}
                    </SelectGroup></SelectContent>
                </Select>
            </div>
            <div className="flex items-center justify-end space-x-2">
                <Button onClick={onCancel} variant="secondary" size="sm" className="h-8 text-xs" type="button">Cancel</Button>
                <Button type="submit" size="sm" className="h-8 text-xs" disabled={loading || !formData.title} loading={loading}>Save changes</Button>
            </div>
        </form>
    );
};
