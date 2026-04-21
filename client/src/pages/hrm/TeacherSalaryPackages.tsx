import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  useTeacherSalaryPackages,
  useDeleteTeacherSalaryPackage,
  PACKAGE_TYPES,
  PACKAGE_ROLES,
  getPackageTypeLabel,
  formatUnitPrice,
} from "@/hooks/use-teacher-salary-packages";
import type { TeacherSalaryPackage } from "@/hooks/use-teacher-salary-packages";
import { SalaryPackageDialog } from "./salary-packages/SalaryPackageDialog";
import { useMyPermissions } from "@/hooks/use-my-permissions";

export function TeacherSalaryPackages() {
  const { data: myPerms } = useMyPermissions();
  const perm = myPerms?.permissions?.["/teacher-salary#salary-packages"];
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;

  const canAdd = isSuperAdmin || !!(perm?.canCreate || perm?.canEdit || perm?.canDelete);
  const canEditRow = isSuperAdmin || !!(perm?.canEdit || perm?.canDelete);
  const canDeleteRow = isSuperAdmin || !!perm?.canDelete;

  const { data: packages = [], isLoading } = useTeacherSalaryPackages();
  const deleteMutation = useDeleteTeacherSalaryPackage();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<TeacherSalaryPackage | null>(null);
  const [filterType, setFilterType] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [searchText, setSearchText] = useState("");

  const filtered = useMemo(() => {
    return packages.filter((pkg) => {
      if (filterType !== "all" && pkg.type !== filterType) return false;
      if (filterRole !== "all" && pkg.role !== filterRole) return false;
      if (searchText.trim()) {
        if (!pkg.name.toLowerCase().includes(searchText.toLowerCase())) return false;
      }
      return true;
    });
  }, [packages, filterType, filterRole, searchText]);

  const handleAdd = () => {
    setEditItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (pkg: TeacherSalaryPackage) => {
    setEditItem(pkg);
    setDialogOpen(true);
  };

  const handleDelete = async (pkg: TeacherSalaryPackage) => {
    if (!confirm(`Bạn có chắc muốn xoá gói lương "${pkg.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(pkg.id);
      toast({ title: "Thành công", description: "Xoá gói lương thành công" });
    } catch (error: any) {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể xoá gói lương",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="rounded-xl border bg-card p-5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-foreground">Danh sách gói lương</h2>
          </div>
          {canAdd && (
            <Button onClick={handleAdd} className="gap-1.5" data-testid="button-add-package">
              <Plus className="h-4 w-4" />
              Thêm gói lương
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-end gap-4 mb-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground font-medium">Loại gói</span>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-9 w-[140px]" data-testid="filter-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {PACKAGE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground font-medium">Vai trò</span>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="h-9 w-[130px]" data-testid="filter-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {PACKAGE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground font-medium">Tìm kiếm</span>
            <Input
              className="h-9 w-[200px]"
              placeholder="Tên gói lương..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              data-testid="input-search-package"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900 border-b">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tên gói</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Loại gói</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vai trò</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Đơn giá</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="h-40 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Package className="h-8 w-8 opacity-20" />
                      <p>Chưa có gói lương nào. Nhấn "Thêm gói lương" để tạo.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((pkg) => (
                  <tr
                    key={pkg.id}
                    className="border-b last:border-0 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors"
                    data-testid={`row-package-${pkg.id}`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground" data-testid={`text-name-${pkg.id}`}>
                      {pkg.name}
                    </td>
                    <td className="px-4 py-3 text-foreground" data-testid={`text-type-${pkg.id}`}>
                      {getPackageTypeLabel(pkg.type)}
                    </td>
                    <td className="px-4 py-3 text-foreground" data-testid={`text-role-${pkg.id}`}>
                      {pkg.role}
                    </td>
                    <td
                      className={`px-4 py-3 ${!pkg.unitPrice ? "text-muted-foreground italic" : "text-foreground"}`}
                      data-testid={`text-price-${pkg.id}`}
                    >
                      {formatUnitPrice(pkg)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEditRow && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => handleEdit(pkg)}
                            data-testid={`button-edit-${pkg.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDeleteRow && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(pkg)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${pkg.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SalaryPackageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editItem={editItem}
      />
    </>
  );
}
