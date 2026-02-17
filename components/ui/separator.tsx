import * as React from "react";

import { cn } from "@/lib/utils";

export function Separator({ className }: { className?: string }): React.ReactElement {
  return <div className={cn("h-px w-full bg-border", className)} role="separator" aria-hidden="true" />;
}
