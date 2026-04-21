import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useClassMutations } from "@/hooks/use-class-mutations";
import { useClassList } from "@/hooks/use-class-list";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Plus, LayoutGrid, List, Upload, Download, FileSpreadsheet, X } from "lucide-react";
import { Link } from "wouter";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useClassExcel } from "@/hooks/use-class-excel";
import { EditClassDialog } from "@/components/education/EditClassDialog";
import { ClassDetailDialog } from "@/components/education/ClassDetailDialog";
import { ClassCard } from "@/components/education/ClassCard";
import { ClassTableRow } from "@/components/education/ClassTableRow";
import { ClassFilterBar } from "@/components/education/ClassFilterBar";
import { ClassDeleteDialogs } from "@/components/education/ClassDeleteDialogs";
import { ClassBulkActions } from "@/components/education/ClassBulkActions";
import { ClassActivityLogDialog } from "@/components/education/ClassActivityLogDialog";

export function ClassList() {
  const [detailClassId, setDetailClassId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);

  const openDetail = (id: string) => {
    setDetailClassId(id);
    setIsDetailOpen(true);
  };

  const { data: myPerms } = useMyPermissions();
  const perm = myPerms?.permissions?.["/classes"];
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;

  const canAdd = isSuperAdmin || !!(perm?.canCreate || perm?.canEdit || perm?.canDelete);
  const canEditRow = isSuperAdmin || !!(perm?.canEdit || perm?.canDelete);
  const canDeleteRow = isSuperAdmin || !!perm?.canDelete;

  const { data: locations } = useQuery<any[]>({
    queryKey: ["/api/locations"],
  });

  const {
    searchTerm, setSearchTerm,
    locationFilter, setLocationFilter,
    statusFilter, setStatusFilter,
    viewMode, setViewMode,
    classes, isLoading,
    selectedIds, setSelectedIds,
    isAllSelected, isSomeSelected,
    toggleAll, toggleOne,
    editClassId,
    isEditOpen, setIsEditOpen,
    openEdit, closeEdit,
    deleteTarget, setDeleteTarget,
    isBulkDeleteOpen, setIsBulkDeleteOpen,
    deleteInvoiceCount, setDeleteInvoiceCount,
    openDelete, openBulkDelete,
    filteredClasses,
    getComputedStatus,
  } = useClassList();

  const {
    isImportOpen, setIsImportOpen,
    importFile, importProgress, importStatus,
    handleImportFile, handleImportUpload, resetImport, downloadSample,
  } = useClassExcel({ locations });

  const { deleteClassMutation, bulkDeleteClassMutation } = useClassMutations();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Quản lý Lớp học</h1>
            <p className="text-muted-foreground">Trung tâm nhiều cơ sở | Quản lý tuyển sinh & vận hành</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <button onClick={() => setViewMode("card")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", viewMode === "card" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>
                <LayoutGrid className="h-3.5 w-3.5" />Card
              </button>
              <button onClick={() => setViewMode("table")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", viewMode === "table" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>
                <List className="h-3.5 w-3.5" />Table
              </button>
            </div>
            {canAdd && (
              <Button variant="outline" className="gap-2 shadow-sm" onClick={() => { resetImport(); setIsImportOpen(true); }} data-testid="button-import-class">
                <Upload className="h-4 w-4" />Tải lên
              </Button>
            )}
            {canAdd && (
              <Link href="/classes/create">
                <Button className="gap-2 shadow-sm" data-testid="button-create-class">
                  <Plus className="h-4 w-4" />Tạo lớp mới
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Filters */}
        <ClassFilterBar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          locationFilter={locationFilter}
          onLocationChange={setLocationFilter}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          locations={locations}
          onOpenActivityLog={() => setIsActivityLogOpen(true)}
        />

        {/* Bulk action bar */}
        <ClassBulkActions
          selectedCount={selectedIds.size}
          onDeleteSelected={openBulkDelete}
          onClearSelection={() => setSelectedIds(new Set())}
          canDelete={canDeleteRow}
        />

        {/* Card View */}
        {viewMode === "card" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="h-48 animate-pulse bg-muted" />
              ))
            ) : filteredClasses?.length === 0 ? (
              <div className="col-span-full py-12 text-center text-muted-foreground">
                Không tìm thấy lớp học nào phù hợp.
              </div>
            ) : (
              filteredClasses?.map((cls) => (
                <ClassCard
                  key={cls.id}
                  cls={cls}
                  isSelected={selectedIds.has(cls.id)}
                  onToggle={(checked) => toggleOne(cls.id, checked)}
                  onEdit={() => openEdit(cls.id)}
                  onDelete={() => openDelete(cls.id, cls.name)}
                  onViewDetail={() => openDetail(cls.id)}
                  computedStatus={getComputedStatus(cls)}
                  canEdit={canEditRow}
                  canDelete={canDeleteRow}
                />
              ))
            )}
          </div>
        ) : (
          /* Table View */
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  {canDeleteRow && (
                    <TableHead className="w-[44px]">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={toggleAll}
                        data-testid="checkbox-select-all"
                        ref={(el) => {
                          if (el) (el as any).indeterminate = isSomeSelected && !isAllSelected;
                        }}
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-[100px]">Mã</TableHead>
                  <TableHead className="min-w-[200px]">Lớp</TableHead>
                  <TableHead>Cơ sở</TableHead>
                  <TableHead className="text-center">Chờ | Chính thức</TableHead>
                  <TableHead>Giáo viên</TableHead>
                  <TableHead>Phụ trách</TableHead>
                  <TableHead>Ca học / Thứ</TableHead>
                  <TableHead className="text-center">Đã tạo lịch</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right w-[100px]">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: canDeleteRow ? 10 : 9 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-full bg-muted animate-pulse rounded" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredClasses?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canDeleteRow ? 10 : 9} className="text-center py-12 text-muted-foreground">
                      Không tìm thấy lớp học nào phù hợp.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClasses?.map((cls) => (
                    <ClassTableRow
                      key={cls.id}
                      cls={cls}
                      isSelected={selectedIds.has(cls.id)}
                      onToggle={(checked) => toggleOne(cls.id, checked)}
                      onEdit={() => openEdit(cls.id)}
                      onDelete={() => openDelete(cls.id, cls.name)}
                      onViewDetail={() => openDetail(cls.id)}
                      computedStatus={getComputedStatus(cls)}
                      canEdit={canEditRow}
                      canDelete={canDeleteRow}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="p-4 border-t bg-muted/20 flex items-center justify-between text-xs text-muted-foreground rounded-b-xl border border-border mt-[-1px]">
          <div>Hiển thị {filteredClasses?.length || 0} trên {classes?.length || 0} lớp học</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[10px]" disabled>Trước</Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" disabled>Sau</Button>
          </div>
        </div>
      </div>

      {/* Activity Log Dialog */}
      <ClassActivityLogDialog
        open={isActivityLogOpen}
        onOpenChange={setIsActivityLogOpen}
      />

      {/* Detail Dialog */}
      <ClassDetailDialog
        classId={detailClassId}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />

      {/* Edit Dialog */}
      <EditClassDialog
        classId={editClassId}
        isOpen={isEditOpen}
        onOpenChange={(open) => {
          if (!open) closeEdit(); else setIsEditOpen(true);
        }}
      />

      <ClassDeleteDialogs
        deleteTarget={deleteTarget}
        onSingleOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteInvoiceCount(0); } }}
        onSingleConfirm={() => deleteTarget && deleteClassMutation.mutate(deleteTarget.id, { onSuccess: () => { setDeleteTarget(null); setDeleteInvoiceCount(0); } })}
        isBulkDeleteOpen={isBulkDeleteOpen}
        onBulkOpenChange={(open) => { setIsBulkDeleteOpen(open); if (!open) setDeleteInvoiceCount(0); }}
        onBulkConfirm={() => bulkDeleteClassMutation.mutate(Array.from(selectedIds), { onSuccess: () => { setSelectedIds(new Set()); setIsBulkDeleteOpen(false); setDeleteInvoiceCount(0); } })}
        selectedCount={selectedIds.size}
        deleteInvoiceCount={deleteInvoiceCount}
      />

      {/* Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={(open) => { setIsImportOpen(open); if (!open) resetImport(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Tải lên danh sách lớp học
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Step 1: Download sample */}
            <div className="rounded-lg border border-dashed border-border p-4 bg-muted/30">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-green-100 dark:bg-green-950">
                  <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Tải file mẫu Excel</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sử dụng file mẫu để điền đúng định dạng dữ liệu</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 gap-1.5 h-8 text-xs"
                    data-testid="button-download-template"
                    onClick={downloadSample}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tải file mẫu
                  </Button>
                </div>
              </div>
            </div>

            {/* Step 2: Choose file */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Chọn file Excel để import</p>
              {!importFile ? (
                <label
                  htmlFor="import-file-input"
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors p-6"
                  data-testid="label-import-file"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Nhấn để chọn file hoặc kéo thả vào đây</p>
                    <p className="text-xs text-muted-foreground mt-0.5">.xlsx, .xls – tối đa 10MB</p>
                  </div>
                  <input
                    id="import-file-input"
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleImportFile}
                    data-testid="input-import-file"
                  />
                </label>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <FileSpreadsheet className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{importFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(importFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  {importStatus === "idle" && (
                    <button
                      onClick={resetImport}
                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                      data-testid="button-remove-file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Step 3: Progress */}
            {(importStatus === "uploading" || importStatus === "done" || importStatus === "error") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {importStatus === "uploading" && "Đang tải lên..."}
                    {importStatus === "done" && "Tải lên thành công!"}
                    {importStatus === "error" && "Có lỗi xảy ra"}
                  </span>
                  <span className={importStatus === "done" ? "text-green-600 font-medium" : ""}>
                    {Math.min(importProgress, 100)}%
                  </span>
                </div>
                <Progress
                  value={Math.min(importProgress, 100)}
                  className={`h-2 ${importStatus === "done" ? "[&>div]:bg-green-500" : importStatus === "error" ? "[&>div]:bg-destructive" : ""}`}
                />
                {importStatus === "done" && (
                  <p className="text-xs text-green-600 font-medium text-center">✓ Import hoàn tất. Vui lòng kiểm tra danh sách lớp.</p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setIsImportOpen(false); resetImport(); }}
                data-testid="button-import-cancel"
              >
                Hủy
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={!importFile || importStatus === "uploading" || importStatus === "done"}
                onClick={handleImportUpload}
                data-testid="button-import-submit"
              >
                <Upload className="h-4 w-4" />
                {importStatus === "uploading" ? "Đang tải..." : importStatus === "done" ? "Hoàn tất" : "Tải lên"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
