import { useState } from "react";
import { Pencil, Trash2, Loader2, Search, X } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Pagination } from "./Pagination";
import { GradeBookRow, GradeBookFilters } from "../types";

// ── Sub-components ─────────────────────────────────────────

function PublishedBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-green-50 text-green-700 border-green-200">
      Đã công bố
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-gray-100 text-gray-500 border-gray-200">
      Nháp
    </span>
  );
}

function GradeBookFilterBar({
  filters,
  locations,
  onChange,
}: {
  filters: GradeBookFilters;
  locations: { id: string; name: string }[];
  onChange: (patch: Partial<GradeBookFilters>) => void;
}) {
  const hasActive = filters.search || filters.locationId || filters.published;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tìm theo tiêu đề, tên lớp..."
          className="pl-10 h-9 text-sm"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          data-testid="input-gb-search"
        />
      </div>

      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        value={filters.locationId}
        onChange={(e) => onChange({ locationId: e.target.value })}
        data-testid="select-gb-location"
      >
        <option value="">Tất cả cơ sở</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>

      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        value={filters.published}
        onChange={(e) => onChange({ published: e.target.value as GradeBookFilters["published"] })}
        data-testid="select-gb-published"
      >
        <option value="">Tất cả trạng thái</option>
        <option value="true">Đã công bố</option>
        <option value="false">Nháp</option>
      </select>

      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-sm gap-1.5 text-muted-foreground"
          onClick={() => onChange({ search: "", locationId: "", published: "" })}
          data-testid="button-gb-clear-filters"
        >
          <X className="h-3.5 w-3.5" />
          Xóa bộ lọc
        </Button>
      )}
    </div>
  );
}

function EditGradeBookDialog({
  book,
  open,
  onClose,
  onSave,
  isSaving,
}: {
  book: GradeBookRow | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: { title: string; published: boolean }) => void;
  isSaving: boolean;
}) {
  const [title, setTitle] = useState(book?.title ?? "");
  const [published, setPublished] = useState(book?.published ?? false);

  if (!book) return null;

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setTitle(book.title);
      setPublished(book.published);
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Sửa bảng điểm</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Tiêu đề</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 text-sm"
              data-testid="input-edit-gb-title"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground">Trạng thái</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={published ? "true" : "false"}
              onChange={(e) => setPublished(e.target.value === "true")}
              data-testid="select-edit-gb-published"
            >
              <option value="false">Nháp</option>
              <option value="true">Đã công bố</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
            Hủy
          </Button>
          <Button
            size="sm"
            onClick={() => onSave({ title, published })}
            disabled={isSaving || !title.trim()}
            data-testid="button-edit-gb-save"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ─────────────────────────────────────────

interface GradeBookTabProps {
  data: GradeBookRow[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  filters: GradeBookFilters;
  locations: { id: string; name: string }[];
  onFiltersChange: (patch: Partial<GradeBookFilters>) => void;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  onDelete: (book: GradeBookRow) => void;
  onEdit: (book: GradeBookRow, data: { title: string; published: boolean }) => void;
  isDeleting: boolean;
  isEditing: boolean;
}

export function GradeBookTab({
  data,
  total,
  page,
  pageSize,
  isLoading,
  filters,
  locations,
  onFiltersChange,
  onPageChange,
  onPageSizeChange,
  onDelete,
  onEdit,
  isDeleting,
  isEditing,
}: GradeBookTabProps) {
  const [editTarget, setEditTarget] = useState<GradeBookRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GradeBookRow | null>(null);

  const fmt = (d: string | null) =>
    d ? format(new Date(d), "dd/MM/yyyy HH:mm") : "—";

  return (
    <>
      <Card className="rounded-xl border border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            Bảng điểm
            {total > 0 && (
              <Badge className="bg-violet-100 text-violet-800 font-normal text-xs border-0">
                {total}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <GradeBookFilterBar
            filters={filters}
            locations={locations}
            onChange={onFiltersChange}
          />

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/60 border-b">
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">STT</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Cơ sở</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Tiêu đề</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Tên lớp</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Bảng điểm</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Trạng thái</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Người tạo</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Ngày tạo</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Người cập nhật</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Ngày cập nhật</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="text-center py-10">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center text-muted-foreground py-10 text-sm">
                      Không có bảng điểm nào
                    </td>
                  </tr>
                ) : (
                  data.map((row, idx) => (
                    <tr
                      key={row.id}
                      data-testid={`gb-row-${row.id}`}
                      className="border-b hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-3 py-3 text-muted-foreground text-xs">
                        {(page - 1) * pageSize + idx + 1}
                      </td>
                      <td className="px-3 py-3 text-sm">{row.locationName}</td>
                      <td className="px-3 py-3 font-medium text-sm max-w-[180px] truncate" title={row.title}>
                        {row.title}
                      </td>
                      <td className="px-3 py-3 text-sm text-muted-foreground">{row.className}</td>
                      <td className="px-3 py-3 text-sm text-muted-foreground">{row.scoreSheetName}</td>
                      <td className="px-3 py-3">
                        <PublishedBadge published={row.published} />
                      </td>
                      <td className="px-3 py-3 text-sm text-muted-foreground">{row.createdByName}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmt(row.createdAt)}</td>
                      <td className="px-3 py-3 text-sm text-muted-foreground">{row.updatedByName}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmt(row.updatedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => setEditTarget(row)}
                            data-testid={`button-edit-gb-${row.id}`}
                            title="Sửa"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                            onClick={() => setDeleteTarget(row)}
                            data-testid={`button-delete-gb-${row.id}`}
                            title="Xóa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </CardContent>
      </Card>

      <EditGradeBookDialog
        book={editTarget}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSave={(d) => {
          if (editTarget) {
            onEdit(editTarget, d);
            setEditTarget(null);
          }
        }}
        isSaving={isEditing}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa bảng điểm?</AlertDialogTitle>
            <AlertDialogDescription>
              Bảng điểm <span className="font-semibold">"{deleteTarget?.title}"</span> sẽ bị xóa vĩnh viễn cùng toàn bộ điểm số.
              Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteTarget) {
                  onDelete(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
              disabled={isDeleting}
              data-testid="button-confirm-delete-gb"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
