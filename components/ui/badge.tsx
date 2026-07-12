import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium font-mono",
  {
    variants: {
      variant: {
        neutral: "border-border-strong bg-raised-2 text-muted",
        sample: "border-warn/40 bg-warn/10 text-warn",
        pass: "border-accent/40 bg-accent/10 text-accent",
        fail: "border-danger/40 bg-danger/10 text-danger",
        live: "border-accent/40 bg-accent/10 text-accent",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
