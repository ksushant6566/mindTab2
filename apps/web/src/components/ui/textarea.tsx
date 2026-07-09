import * as React from "react"

import { cn } from "~/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-[var(--r-2)] border border-input bg-background px-3 py-2 text-[length:var(--type-body-size)] font-[var(--type-body-weight)] leading-[var(--type-body-line)] text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:border-[var(--ink-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
