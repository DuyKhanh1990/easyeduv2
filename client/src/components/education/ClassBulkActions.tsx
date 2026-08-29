import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface ClassBulkActionsProps {
  selectedCount: number;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  canDelete?: boolean;
}

export function ClassBulkActions({
  selectedCount,
  onDeleteSelected,
  onClearSelection,
  canDelete = true,
}: ClassBulkActionsProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
      <span className="text-sm font-medium text-primary">
        Đã chọn {selectedCount} lớp học
      </span>
      {canDelete && (
        <Button
          variant="destructive"
          size="sm"
          className="gap-2 ml-auto"
          onClick={onDeleteSelected}
        >
          <Trash2 className="h-4 w-4" />Xóa đã chọn
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={onClearSelection} className={canDelete ? "" : "ml-auto"}>
        Bỏ chọn
      </Button>
    </div>
  );
}
