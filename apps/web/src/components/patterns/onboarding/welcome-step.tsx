import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { TipTapEditor } from "~/components/text-editor";
import { useCreateNote } from "~/api/hooks";
import { toast } from "sonner";

type WelcomeStepProps = {
    userName: string;
    onNext: () => void;
};

function getDefaultContent(_firstName: string) {
    return `<p>Most productivity tools ask you to change how you work. MindTab just asks you to open a new tab.</p><p></p><p>You're reading a <strong>note</strong> right now — the same editor you'll use to plan, capture, and reflect. Everything you type here is real. Edit freely.</p><h3>How MindTab works</h3><p>Your dashboard replaces the new tab page. Every time you open one, you see:</p><ul><li><p><strong>Projects</strong> — containers for different areas of work</p></li><li><p><strong>Tasks</strong> — with priorities, impact levels, schedules, and statuses that track real progress</p></li><li><p><strong>Notes</strong> — a rich editor with <strong>@mentions</strong> that link directly to your tasks, projects, and other notes</p></li><li><p><strong>Calendar</strong> — today's scheduled work and a full planning view</p></li><li><p><strong>Chat and Vault</strong> — ask across your workspace and keep saved material close</p></li></ul><p>Everything is connected. A task belongs to a project. A note can reference a task. Your schedule and context stay visible.</p><h3>Let's build your workspace</h3><p>The next steps take about a minute: name a project, set one task, and create your first note. Small moves — but after this, your new tab will never feel empty again.</p><p></p><p>Hit <strong>Continue</strong> when you're ready. This note saves to your dashboard.</p>`;
}

export function WelcomeStep({ userName, onNext }: WelcomeStepProps) {
    const firstName = userName.split(" ")[0] ?? "there";
    const [title, setTitle] = useState("Your new starting line");
    const [content, setContent] = useState(() => getDefaultContent(firstName));

    const createNote = useCreateNote();

    const handleContinue = () => {
        if (title.trim() && content.trim()) {
            (createNote.mutate as any)(
                {
                    title: title.trim(),
                    content,
                    projectId: null,
                },
                {
                    onSuccess: () => onNext(),
                    onError: (error: any) => {
                        if (error?.status === 409) {
                            onNext();
                            return;
                        }
                        toast.error(error?.message || "Failed to save note");
                    },
                }
            );
        } else {
            onNext();
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <motion.div
                className="rounded-xl border-2 border-border bg-card overflow-hidden"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.1 }}
            >
                <div className="px-2 py-3">
                    <TipTapEditor
                        title={title}
                        onTitleChange={setTitle}
                        content={content}
                        onContentChange={setContent}
                        editable={true}
                    />
                </div>
            </motion.div>

            <motion.div
                className="flex justify-end"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.3 }}
            >
                <Button
                    size="sm"
                    onClick={handleContinue}
                    disabled={createNote.isPending}
                    loading={createNote.isPending}
                    className="group"
                >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
            </motion.div>
        </div>
    );
}
