"use client";

import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dialog wrapper on Base UI primitives (DESIGN §6.1). Focus trapping, keyboard
 * nav, and ARIA roles come from the primitive layer, not from us.
 */

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseDialog.Popup>) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseDialog.Popup
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
          "rounded-xl border border-border-strong bg-raised p-6 shadow-2xl",
          "transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
        <BaseDialog.Close
          className="absolute right-4 top-4 rounded-md p-1 text-muted hover:bg-raised-2 hover:text-text"
          aria-label="Close"
        >
          <X className="size-4" />
        </BaseDialog.Close>
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={cn("text-lg font-semibold text-text", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      className={cn("mt-1 text-sm text-muted", className)}
      {...props}
    />
  );
}
