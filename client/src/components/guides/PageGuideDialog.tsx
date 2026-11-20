import { useState } from "react";
import { BookOpen } from "lucide-react";
import { GuideDocumentDialog } from "@/components/customers/CustomerGuideDialog";
import type { CustomerGuide } from "@shared/customer-guide";
import { Button } from "@/components/ui/button";

type PageGuideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageTitle: string;
  pagePath: string;
  description?: string;
};

export function PageGuideDialog({
  open,
  onOpenChange,
  pageTitle,
  pagePath,
  description,
}: PageGuideDialogProps) {
  const params = new URLSearchParams({ path: pagePath, title: pageTitle });
  const queryKey = [`/api/page-guide?${params.toString()}`];

  return (
    <GuideDocumentDialog
      open={open}
      onOpenChange={onOpenChange}
      queryKey={queryKey}
      saveEndpoint="/api/page-guide"
      savePayload={(guide: CustomerGuide) => ({ path: pagePath, guide })}
    />
  );
}

type PageGuideButtonProps = {
  pageTitle: string;
  pagePath?: string;
  description?: string;
  className?: string;
};

export function PageGuideButton({
  pageTitle,
  pagePath,
  description,
  className,
}: PageGuideButtonProps) {
  const [open, setOpen] = useState(false);
  const resolvedPagePath = pagePath
    ?? (typeof window !== "undefined" ? window.location.pathname : "/");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        className={`h-9 w-9 rounded-xl border-sky-200 bg-white text-sky-600 shadow-sm hover:bg-sky-50 hover:text-sky-700 ${className ?? ""}`}
        aria-label={`Mở tài liệu hướng dẫn trang ${pageTitle}`}
        title={`Tài liệu hướng dẫn trang ${pageTitle}`}
      >
        <BookOpen className="h-4 w-4" />
      </Button>
      <PageGuideDialog
        open={open}
        onOpenChange={setOpen}
        pageTitle={pageTitle}
        pagePath={resolvedPagePath}
        description={description}
      />
    </>
  );
}