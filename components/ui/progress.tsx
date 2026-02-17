"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-3 w-full overflow-hidden rounded-full",
      "bg-white/40 shadow-[inset_0_2px_4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-sm",
      "border border-white/30",
      "dark:bg-emerald-950/30 dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.04)] dark:border-emerald-800/20",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_0_12px_-2px_rgba(16,185,129,0.30)] transition-all duration-700 ease-out"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
