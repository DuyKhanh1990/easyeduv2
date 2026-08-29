import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { STATIC_STALE_TIME } from "@/lib/queryClient";
import { useClassMutations } from "@/hooks/use-class-mutations";
import { useClassList, PAGE_SIZE_OPTIONS } from "@/hooks/use-class-list";
import type { PageSizeOption } from "@/hooks/use-class-list";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Plus, LayoutGrid, List, Upload, Download, FileSpreadsheet, X, Users, User, FileDown } from "lucide-react";
import { Link, useLocation } from "wouter";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useClassExcel, exportClassesToExcel, exportClassStudentsToExcel } from "@/hooks/use-class-excel";
import { InlineClassEntry } from "@/components/education/InlineClassEntry";
import { useToast } from "@/hooks/use-toast";
import { EditClassDialog } from "@/components/education/EditClassDialog";
import { CopyClassDialog } from "@/components/education/CopyClassDialog";
import { ClassCard } from "@/components/education/ClassCard";
import { ClassTableRow } from "@/components/education/ClassTableRow";
import { ClassFilterBar } from "@/components/education/ClassFilterBar";
import { ClassDeleteDialogs } from "@/components/education/ClassDeleteDialogs";
import { ClassBulkActions } from "@/components/education/ClassBulkActions";
import { ClassActivityLogDialog } from "@/components/education/ClassActivityLogDialog";
import { TestSessionsTab } from "./TestSessionsTab";

export function ClassList() {
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [importTab, setImportTab] = useState<string>("excel");

  const { data: myPerms } = useMyPermissions();
  const perm = myPerms?.permissions?.["/classes"];
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;

  const canAdd = isSuperAdmin || !!(perm?.canCreate || perm?.canEdit || perm?.canDelete);
  const canEditRow = isSuperAdmin || !!(perm?.canEdit || perm?.canDelete);
  const canDeleteRow = isSuperAdmin || !!perm?.canDelete;

  const { data: locations } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    staleTime: STATIC_STALE_TIME,
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
    page, setPage,
    pageSize, setPageSize,
    total, totalPages,
  } = useClassList();

  const {
    isImportOpen, setIsImportOpen,
    importFile, importProgress, importStatus,
    handleImportFile, handleImportUpload, resetImport, downloadSample,
  } = useClassExcel({ locations });

  const { deleteClassMutation, bulkDeleteClassMutation } = useClassMutations();
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);
    await exportClassesToExcel({
      locationId: locationFilter,
      search: searchTerm,
      status: statusFilter,
      toast,
    });
    setIsExporting(false);
  };

  const [mainTab, setMainTab] = useState<"official" | "test">("official");
  const [isExporting, setIsExporting] = useState(false);
  const [showCreateTypeDialog, setShowCreateTypeDialog] = useState(false);
  const [copyClassData, setCopyClassData] = useState<any>(null);
  const [, navigate] = useLocation();

  return (
    <DashboardLayout fullscreen>
      <div className="flex flex-col h-full bg-[#ECEEF4]">
        {/* Main tabs */}
        <div className="shrink-0 bg-[#ECEEF4] px-4 md:px-6 lg:px-8 pt-4 md:pt-5 lg:pt-6 pb-3 flex gap-2">
          <button
            onClick={() => setMainTab("official")}
            className={cn(
              "px-6 py-2.5 rounded-lg text-sm font-semibold transition-all border",
              mainTab === "official"
                ? "bg-primary text-primary-foreground border-primary shadow"
                : "bg-background text-foreground border-border hover:bg-muted/60"
            )}
          >
            Lớp học chính thức
          </button>
          <button
            onClick={() => setMainTab("test")}
            className={cn(
              "px-6 py-2.5 rounded-lg text-sm font-semibold transition-all border",
              mainTab === "test"
                ? "bg-primary text-primary-foreground border-primary shadow"
                : "bg-background text-foreground border-border hover:bg-muted/60"
            )}
          >
            Lớp TEST
          </button>
        </div>

        {mainTab === "test" && (
          <div className="flex-1 overflow-hidden px-4 md:px-6 lg:px-8 pb-4">
            <TestSessionsTab />
          </div>
        )}

        {mainTab === "official" && (
          <div className="flex-1 overflow-hidden px-4 md:px-6 lg:px-8 pb-4 flex flex-col gap-4">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button onClick={() => setViewMode("card")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", viewMode === "card" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>
              <LayoutGrid className="h-3.5 w-3.5" />Card
            </button>
            <button onClick={() => setViewMode("table")} className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", viewMode === "table" ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}>
              <List className="h-3.5 w-3.5" />Table
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2 shadow-sm"
              onClick={handleExport}
              disabled={isExporting}
              data-testid="button-export-classes"
            >
              <FileDown className="h-4 w-4" />
              {isExporting ? "Đang xuất..." : "Tải xuống"}
            </Button>
            {canAdd && (
              <Button variant="outline" className="gap-2 shadow-sm" onClick={() => { resetImport(); setIsImportOpen(true); }} data-testid="button-import-class">
                <Upload className="h-4 w-4" />Tải lên
              </Button>
            )}
            {canAdd && (
              <Button className="gap-2 shadow-sm" data-testid="button-create-class" onClick={() => setShowCreateTypeDialog(true)}>
                <Plus className="h-4 w-4" />Tạo lớp mới
              </Button>
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

        {/* Card/Table + Pagination */}
        <div className="flex-1 overflow-hidden flex flex-col">
        {/* Card View */}
        {viewMode === "card" ? (
          <div className="flex-1 overflow-auto">
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
                  onDelete={() => openDelete(cls.id, cls.name, getComputedStatus(cls) === "active", (cls.completedSessions ?? 0) > 0)}
                  onCopy={canAdd ? () => setCopyClassData(cls) : undefined}
                  onExportStudents={() => exportClassStudentsToExcel({ classId: cls.id, className: cls.name, classCode: cls.classCode, toast })}
                  onViewDetail={() => navigate(`/classes/${cls.id}`)}
                  computedStatus={getComputedStatus(cls)}
                  canEdit={canEditRow}
                  canDelete={canDeleteRow}
                />
              ))
            )}
          </div>
          </div>
        ) : (
          /* Table View */
          <div className="flex-1 overflow-hidden flex flex-col bg-card rounded-xl border border-border shadow-sm">
            <div className="flex-1 overflow-auto">
            <div className="overflow-x-auto">
            <Table className="min-w-max">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  {canDeleteRow && (
                    <TableHead className="w-[44px] whitespace-nowrap">
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
                  <TableHead className="w-[100px] whitespace-nowrap">Mã</TableHead>
                  <TableHead className="min-w-[200px] whitespace-nowrap">Lớp</TableHead>
                  <TableHead className="whitespace-nowrap">Cơ sở</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Chờ | Chính thức</TableHead>
                  <TableHead className="whitespace-nowrap">Giáo viên</TableHead>
                  <TableHead className="whitespace-nowrap">Phụ trách</TableHead>
                  <TableHead className="whitespace-nowrap">Ca học / Thứ</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Đã tạo lịch</TableHead>
                  <TableHead className="whitespace-nowrap">Trạng thái</TableHead>
                  <TableHead className="text-right w-[100px] whitespace-nowrap">Hành động</TableHead>
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
                      onDelete={() => openDelete(cls.id, cls.name, getComputedStatus(cls) === "active", (cls.completedSessions ?? 0) > 0)}
                      onCopy={canAdd ? () => setCopyClassData(cls) : undefined}
                      onExportStudents={() => exportClassStudentsToExcel({ classId: cls.id, className: cls.name, classCode: cls.classCode, toast })}
                      onViewDetail={() => navigate(`/classes/${cls.id}`)}
                      computedStatus={getComputedStatus(cls)}
                      canEdit={canEditRow}
                      canDelete={canDeleteRow}
                    />
                  ))
                )}
              </TableBody>
            </Table>
            </div>
            </div>
          </div>
        )}

        <div className="shrink-0 p-3 border border-border bg-muted/20 mt-0 rounded-b-xl flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Hiển thị {filteredClasses?.length || 0} / {total} lớp học</span>
            <span className="text-border">|</span>
            <span>Trang {page}/{totalPages}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Số lớp/trang:</span>
            {PAGE_SIZE_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setPageSize(s as PageSizeOption)}
                className={cn(
                  "px-2 py-0.5 rounded border text-[11px] font-medium transition-all",
                  pageSize === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted/60"
                )}
              >
                {s}
              </button>
            ))}
            <div className="flex gap-1 ml-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] px-3"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] px-3"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        </div>
        </div>
          </div>)}
      </div>

      {/* Activity Log Dialog */}
      <ClassActivityLogDialog
        open={isActivityLogOpen}
        onOpenChange={setIsActivityLogOpen}
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
        <DialogContent
          className={
            importTab === "inline"
              ? "!max-w-[99vw] w-[99vw] max-h-[95vh] overflow-y-auto overflow-x-hidden"
              : "sm:max-w-[min(96vw,1280px)] max-h-[90vh] overflow-y-auto"
          }
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Tạo nhiều lớp học cùng lúc
            </DialogTitle>
          </DialogHeader>

          <Tabs value={importTab} onValueChange={setImportTab} className="w-full min-w-0">
            <TabsList className="grid w-full grid-cols-2" data-testid="tabs-bulk-create">
              <TabsTrigger value="excel" data-testid="tab-excel">Tải lên Excel</TabsTrigger>
              <TabsTrigger value="inline" data-testid="tab-inline">Nhập trực tiếp</TabsTrigger>
            </TabsList>

            <TabsContent value="excel" className="mt-4">
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
            </TabsContent>

            <TabsContent value="inline" className="mt-4 min-w-0 w-full">
              <InlineClassEntry
                locations={locations}
                onSuccess={() => setIsImportOpen(false)}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      {/* Class type selection dialog */}
      <Dialog open={showCreateTypeDialog} onOpenChange={setShowCreateTypeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chọn loại lớp học</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <button
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-center group"
              onClick={() => { setShowCreateTypeDialog(false); navigate("/classes/create"); }}
            >
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-sm">Lớp Nhóm</p>
                <p className="text-xs text-muted-foreground mt-0.5">Nhiều học viên, lịch cố định theo tuần</p>
              </div>
            </button>
            <button
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-purple-500 hover:bg-purple-50 transition-all text-center group"
              onClick={() => { setShowCreateTypeDialog(false); navigate("/classes/create-tutor"); }}
            >
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                <User className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="font-bold text-sm">Lớp Gia sư (1-1)</p>
                <p className="text-xs text-muted-foreground mt-0.5">1 học viên, dạy kèm riêng lẻ</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Copy Class Dialog */}
      <CopyClassDialog
        open={!!copyClassData}
        onClose={() => setCopyClassData(null)}
        sourceClass={copyClassData}
      />
    </DashboardLayout>
  );
}
