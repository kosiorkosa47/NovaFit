"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // iOS-exact sizing: 51x31
      "peer inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full p-[2px]",
      "transition-colors duration-200 ease-in-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // OFF — iOS-style gray with glass
      "data-[state=unchecked]:bg-[rgba(120,120,128,0.16)]",
      "data-[state=unchecked]:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
      // ON — iOS green with glass glow
      "data-[state=checked]:bg-[#34C759]",
      "data-[state=checked]:shadow-[0_0_12px_-2px_rgba(52,199,89,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]",
      // Dark OFF
      "dark:data-[state=unchecked]:bg-[rgba(120,120,128,0.32)]",
      // Dark ON
      "dark:data-[state=checked]:bg-[#30D158]",
      "dark:data-[state=checked]:shadow-[0_0_16px_-2px_rgba(48,209,88,0.45),inset_0_1px_0_rgba(255,255,255,0.12)]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // iOS-exact thumb: 27x27 circle
        "pointer-events-none block h-[27px] w-[27px] rounded-full",
        "bg-white",
        "shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)]",
        "transition-transform duration-200 ease-in-out",
        "data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
