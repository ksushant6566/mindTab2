import { CheckedState } from "@radix-ui/react-checkbox";
import { AnimatePresence, motion } from "framer-motion";
import React, { useRef, useState } from "react";
import Confetti from "react-confetti";
import { Checkbox } from "~/components/ui/checkbox";
import { cn } from "~/lib/utils";

type HabitCellProps = {
    habit: any;
    date: string;
    isEditable: boolean;
    isChecked: boolean;
    onCheckedChange: (checked: CheckedState, date: string) => void;
    variant?: "table" | "card";
};

export const HabitCell: React.FC<HabitCellProps> = ({
    habit,
    date,
    isEditable,
    isChecked,
    onCheckedChange,
    variant = "table",
}) => {
    const [showConfetti, setShowConfetti] = useState(false);
    const [confettiSource, setConfettiSource] = useState({ x: 0, y: 0 });
    const [showXp, setShowXp] = useState(false);
    const [xpAmount, setXpAmount] = useState(10);
    const [xpKey, setXpKey] = useState(0);
    const cellRef = useRef<HTMLDivElement>(null);

    return (
        <div ref={cellRef} className="relative flex h-full w-full items-center justify-center overflow-visible">
            <div className={cn("flex items-center justify-center", variant === "card" ? "size-5" : "size-9")}>
                <Checkbox
                    aria-label={`${isChecked ? "Uncheck" : "Check"} ${habit.title} for ${date}`}
                    className={cn(
                        "size-full rounded-[var(--r-2)] border border-border bg-background text-transparent shadow-none transition-all duration-150 [transition-timing-function:var(--ease-out)] disabled:cursor-default disabled:opacity-100 [&_svg]:size-3.5",
                        isChecked && isEditable && "border-primary bg-primary text-primary-foreground",
                        isChecked && !isEditable && "border-[var(--border-2)] bg-[var(--bg-hover)] text-foreground",
                        isEditable && "cursor-pointer hover:-translate-y-0.5 hover:border-[var(--ink-line)] hover:bg-[var(--bg-soft)] active:scale-95",
                        !isEditable && !isChecked && "bg-[var(--bg-soft)]/50 opacity-70",
                        isChecked && !isEditable && "shadow-[0_0_0_1px_var(--ink-soft)]",
                        variant === "card" && "rounded-[var(--r-1)] [&_svg]:size-3"
                    )}
                    disabled={!isEditable}
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                        if (cellRef.current) {
                            const rect = cellRef.current.getBoundingClientRect();
                            const scrollX = window.scrollX || window.pageXOffset;
                            const scrollY = window.scrollY || window.pageYOffset;
                            setConfettiSource({
                                x: rect.left + rect.width / 2 + scrollX,
                                y: rect.top + rect.height / 2 + scrollY,
                            });
                        }

                        if (checked === true) {
                            setShowConfetti(true);
                            setXpAmount(10);
                            setXpKey((key) => key + 1);
                            setShowXp(true);
                        } else if (checked === false) {
                            setXpAmount(-10);
                            setXpKey((key) => key + 1);
                            setShowXp(true);
                        }

                        onCheckedChange(checked, date);
                    }}
                />
            </div>
            <AnimatePresence>
                {showXp && (
                    <motion.span
                        key={`xp-${xpKey}`}
                        className={cn(
                            "pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-xs font-bold",
                            xpAmount > 0 ? "text-[var(--amber)]" : "text-[var(--rose)]"
                        )}
                        initial={{ opacity: 1, y: 0 }}
                        animate={{ opacity: 0, y: -24 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                        onAnimationComplete={() => setShowXp(false)}
                    >
                        {xpAmount > 0 ? "+10 XP" : "-10 XP"}
                    </motion.span>
                )}
            </AnimatePresence>
            {showConfetti && (
                <Confetti
                    recycle={false}
                    gravity={0.5}
                    opacity={0.7}
                    wind={0.5}
                    initialVelocityY={40}
                    initialVelocityX={10}
                    numberOfPieces={15}
                    colors={["#fafafa", "#f5b344", "#52d9ff", "#ff4d6d"]}
                    confettiSource={{
                        x: confettiSource.x,
                        y: confettiSource.y,
                        w: 0,
                        h: 0,
                    }}
                    style={{
                        position: "fixed",
                        pointerEvents: "none",
                        width: "100%",
                        height: "100%",
                        top: "0",
                        left: "0",
                        zIndex: 9999,
                    }}
                    tweenDuration={100}
                    onConfettiComplete={(confetti) => {
                        confetti?.stop();
                        confetti?.reset();
                        setShowConfetti(false);
                    }}
                />
            )}
        </div>
    );
};
