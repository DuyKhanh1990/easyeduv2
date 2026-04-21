import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ClassDeleteDialogsProps {
  deleteTarget: { id: string; name: string } | null;
  onSingleOpenChange: (open: boolean) => void;
  onSingleConfirm: () => void;
  isBulkDeleteOpen: boolean;
  onBulkOpenChange: (open: boolean) => void;
  onBulkConfirm: () => void;
  selectedCount: number;
  deleteInvoiceCount: number;
}

function InvoiceWarning({ count, bulk }: { count: number; bulk?: boolean }) {
  if (count <= 0) return null;
  return (
    <div className="mt-3 flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-700 p-3 text-sm text-yellow-800 dark:text-yellow-300">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
      <span>
        {bulk ? (
          <>Có <strong>{count}</strong> hoá đơn liên quan đến các lớp đã chọn. Sau khi xóa, các hoá đơn này sẽ không còn liên kết với lớp học nhưng vẫn được lưu trong hệ thống.</>
        ) : (
          <>Lớp này có <strong>{count}</strong> hoá đơn liên quan. Sau khi xóa, các hoá đơn này sẽ không còn liên kết với lớp học nhưng vẫn được lưu trong hệ thống.</>
        )}
      </span>
    </div>
  );
}

export function ClassDeleteDialogs({
  deleteTarget,
  onSingleOpenChange,
  onSingleConfirm,
  isBulkDeleteOpen,
  onBulkOpenChange,
  onBulkConfirm,
  selectedCount,
  deleteInvoiceCount,
}: ClassDeleteDialogsProps) {
  return (
    <>
      {/* Single Delete Confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={onSingleOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />Xác nhận xóa lớp học
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa lớp <strong>{deleteTarget?.name}</strong>?
              Thao tác này sẽ xóa tất cả buổi học và dữ liệu liên quan. Không thể hoàn tác.
            </AlertDialogDescription>
            <InvoiceWarning count={deleteInvoiceCount} />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={onSingleConfirm}
            >
              Xóa lớp học
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirm */}
      <AlertDialog open={isBulkDeleteOpen} onOpenChange={onBulkOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />Xác nhận xóa nhiều lớp
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa <strong>{selectedCount}</strong> lớp học đã chọn?
              Thao tác này sẽ xóa tất cả buổi học và dữ liệu liên quan. Không thể hoàn tác.
            </AlertDialogDescription>
            <InvoiceWarning count={deleteInvoiceCount} bulk />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={onBulkConfirm}
            >
              Xóa {selectedCount} lớp học
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
