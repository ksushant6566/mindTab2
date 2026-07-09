import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "~/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-[var(--r-pill)] bg-[var(--border)]">
      <SliderPrimitive.Range className="absolute h-full rounded-[var(--r-pill)] bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block size-4 rounded-full border border-[var(--border-2)] bg-white shadow-[var(--shadow-elevated)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
