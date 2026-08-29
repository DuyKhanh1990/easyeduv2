import type { ReactNode } from "react";
import { History } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function HistoryDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,760px)] w-[90vw] max-w-[90vw] flex-col gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="flex shrink-0 flex-row items-center gap-2 border-b bg-slate-50 px-5 py-3 text-left">
          <History className="h-5 w-5 text-violet-600" />
          <DialogTitle className="text-sm font-bold">{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </DialogContent>
    </Dialog>
  );
}