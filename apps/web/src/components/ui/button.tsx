import { Slot } from '@radix-ui/react-slot'
import type { ButtonSize, ButtonVariant } from '@mindtab/shared'
import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'

import { Loader2 } from 'lucide-react'
import { cn } from '~/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-[var(--r-2)] text-sm font-medium ring-offset-background transition-all duration-150 [transition-timing-function:var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_0_0_1px_var(--ink),0_8px_20px_-8px_rgba(250,250,250,0.5)] hover:bg-[var(--ink-2)] hover:shadow-[0_0_0_1px_var(--ink-2),0_12px_28px_-8px_rgba(250,250,250,0.7)]',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-border bg-background text-foreground hover:border-[var(--border-2)] hover:bg-secondary',
        secondary: 'border border-border bg-secondary text-secondary-foreground hover:bg-[var(--bg-hover)]',
        ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        link: 'text-[var(--ink)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 rounded-[var(--r-3)] px-6 text-[14.5px] font-semibold',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  hideContentWhenLoading?: boolean
  variant?: ButtonVariant
  size?: ButtonSize
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, hideContentWhenLoading = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
        {loading ? (
          hideContentWhenLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {props.children}
            </>
          )
        ) : (
          props.children
        )}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
