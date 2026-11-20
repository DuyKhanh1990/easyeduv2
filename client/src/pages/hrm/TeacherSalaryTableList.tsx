import { useState } from "react";
import { Plus, Pencil, Trash2, Wallet, Eye } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeacherSalaryTables, useDeleteTeacherSalaryTable } from "@/hooks/use-teacher-salary";
import type { TeacherSalaryTableWithRelations } from "@/hooks/use-teacher-salary";
import { TeacherSalaryDialog } from "./TeacherSalaryDialog";
import { TeacherSalaryDetailDialog } from "./TeacherSalaryDetailDialog";
import { useToast } from "@/hooks/use-toast";
import { useMyPermissions } from "@/hooks/use-my-permissions";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: vi });
  } catch {
    return dateStr;
  }
}

type DetailInfo = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  locationId?: string;
  locationName?: string;
};

export function TeacherSalaryTableList() {
  const { data: myPerms } = useMyPermissions();
  const perm = myPerms?.permissions?.["/teacher-salary#salary-tables"];
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;

  const canAdd = isSuperAdmin || !!(perm?.canCreate || perm?.canEdit || perm?.canDelete);
  const canEditRow = isSuperAdmin || !!(perm?.canEdit || perm?.canDelete);
  const canDeleteRow = isSuperAdmin || !!perm?.canDelete;
  const hasRowActions = canEditRow || canDeleteRow;

  const { data: salaryTables, isLoading } = useTeacherSalaryTables();
  const deleteMutation = useDeleteTeacherSalaryTable();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<TeacherSalaryTableWithRelations | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailInfo, setDetailInfo] = useState<DetailInfo | null>(null);

  const handleAdd = () => {
    setEditItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: TeacherSalaryTableWithRelations) => {
    setEditItem(item);
    setDialogOpen(true);
  };

  const handleOpenDetail = (item: TeacherSalaryTableWithRelations) => {
    setDetailInfo({
      id: item.id,
      name: item.name,
      startDate: item.startDate ?? "",
      endDate: item.endDate ?? "",
      locationId: item.locationId,
      locationName: item.location?.name,
    });
    setDetailOpen(true);
  };

  const handleDelete = async (item: TeacherSalaryTableWithRelations) => {
    if (!confirm(`Bạn có chắc muốn xoá bảng lương "${item.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(item.id);
      toast({ title: "Thành công", description: "Xoá bảng lương thành công" });
    } catch (error: any) {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xoá bảng lương",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {canAdd && (
        <div className="flex justify-end mb-4">
          <Button onClick={handleAdd} className="gap-2" data-testid="button-add-salary-table">
            <Plus className="h-4 w-4" />
            Thêm mới
          </Button>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cơ sở</TableHead>
              <TableHead>Tên bảng lương</TableHead>
              <TableHead>Ngày bắt đầu</TableHead>
              <TableHead>Ngày kết thúc</TableHead>
              <TableHead>Tạo bởi</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : salaryTables && salaryTables.length > 0 ? (
              salaryTables.map((item) => (
                <TableRow key={item.id} data-testid={`row-salary-${item.id}`}>
                  <TableCell data-testid={`text-location-${item.id}`}>
                    {item.location?.name ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium" data-testid={`text-name-${item.id}`}>
                    {item.name}
                  </TableCell>
                  <TableCell data-testid={`text-start-date-${item.id}`}>
                    {formatDate(item.startDate)}
                  </TableCell>
                  <TableCell data-testid={`text-end-date-${item.id}`}>
                    {formatDate(item.endDate)}
                  </TableCell>
                  <TableCell data-testid={`text-creator-${item.id}`}>
                    {item.creatorName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDetail(item)}
                        title="Xem chi tiết bảng lương"
                        data-testid={`button-detail-${item.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canEditRow && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(item)}
                          data-testid={`button-edit-${item.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDeleteRow && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(item)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Wallet className="h-8 w-8 opacity-20" />
                    <p>Chưa có bảng lương nào.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <TeacherSalaryDialog
        key={editItem ? `edit-${editItem.id}` : "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editItem={editItem}
        onCreated={(info) => {
          setDetailInfo({
            id: info.id,
            name: info.name,
            startDate: info.startDate,
            endDate: info.endDate,
            locationName: info.locationName,
          });
          setDetailOpen(true);
        }}
      />

      <TeacherSalaryDetailDialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        salaryTableId={detailInfo?.id}
        salaryTableName={detailInfo?.name}
        startDate={detailInfo?.startDate}
        endDate={detailInfo?.endDate}
        locationId={detailInfo?.locationId}
        locationName={detailInfo?.locationName}
      />
    </>
  );
}
