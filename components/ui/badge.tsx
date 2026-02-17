import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border-[1.5px] px-2.5 py-0.5 text-[11px] font-medium tracking-wide transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-white/40 bg-white/40 text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_2px_8px_-2px_rgba(16,185,129,0.10)] backdrop-blur-sm dark:border-emerald-700/25 dark:bg-emerald-900/25 dark:text-emerald-300 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        secondary:
          "border-white/35 bg-white/35 text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] backdrop-blur-sm dark:border-emerald-800/20 dark:bg-emerald-950/25 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        destructive:
          "border-red-200/40 bg-red-50/40 text-destructive shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] backdrop-blur-sm dark:border-red-800/25 dark:bg-red-950/25",
        outline: "text-foreground border-white/30 bg-white/20 backdrop-blur-sm dark:border-emerald-800/20 dark:bg-emerald-950/15",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
