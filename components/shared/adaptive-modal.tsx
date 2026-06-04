"use client"

import type { ModalStyle } from "@/lib/preferences/types"
import { useModalStyle } from "@/lib/preferences/modal-style-context"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export interface AdaptiveModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /** Optional override. When omitted, resolves from the user's saved
   *  preference via ModalStyleProvider context. */
  modalStyle?: ModalStyle
  children: React.ReactNode
  footer?: React.ReactNode
  contentClassName?: string
}

export function AdaptiveModal({
  open,
  onClose,
  title,
  description,
  modalStyle: modalStyleProp,
  children,
  footer,
  contentClassName,
}: AdaptiveModalProps) {
  const contextStyle = useModalStyle()
  const modalStyle = modalStyleProp ?? contextStyle
  if (modalStyle === "sheet") {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          className={cn(
            "w-full sm:max-w-lg overflow-y-auto font-sans",
            contentClassName
          )}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description ? (
              <SheetDescription>{description}</SheetDescription>
            ) : null}
          </SheetHeader>
          {children}
          {footer ? <SheetFooter>{footer}</SheetFooter> : null}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          "sm:max-w-lg max-h-[90vh] overflow-y-auto font-sans",
          contentClassName
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}
