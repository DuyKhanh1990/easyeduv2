import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CrmRelationship {
  id: string;
  name: string;
  color?: string;
  position?: string;
  isParentGroup?: boolean;
  parentId?: string | null;
  isSystemDefault?: boolean;
  isUsed?: boolean;
}

interface BulkActionDialogsProps {
  selectedIds: string[];
  students: any[];
  staff: any[];
  parents: any[];
  locations: any[];
  sortedRelationships: CrmRelationship[];
  updateStudent: { isPending: boolean };

  isBulkRelOpen: boolean;
  setIsBulkRelOpen: (v: boolean) => void;
  selectedBulkRels: string[];
  setSelectedBulkRels: (ids: string[]) => void;
  toggleBulkRel: (id: string) => void;
  handleBulkUpdateRelationship: (ids: string[]) => void;

  isBulkLocationOpen: boolean;
  setIsBulkLocationOpen: (v: boolean) => void;
  selectedBulkLocations: string[];
  setSelectedBulkLocations: (ids: string[]) => void;
  bulkLocationMode: "replace" | "add";
  setBulkLocationMode: (v: "replace" | "add") => void;
  bulkLocationSearch: string;
  setBulkLocationSearch: (v: string) => void;
  handleBulkUpdateLocation: (ids: string[]) => void;

  isBulkSaleOpen: boolean;
  setIsBulkSaleOpen: (v: boolean) => void;
  selectedBulkSales: string[];
  setSelectedBulkSales: (ids: string[]) => void;
  bulkSaleMode: "replace" | "add";
  setBulkSaleMode: (v: "replace" | "add") => void;
  bulkSaleSearch: string;
  setBulkSaleSearch: (v: string) => void;
  handleBulkUpdateSale: (ids: string[]) => void;

  isBulkManagerOpen: boolean;
  setIsBulkManagerOpen: (v: boolean) => void;
  selectedBulkManagers: string[];
  setSelectedBulkManagers: (ids: string[]) => void;
  bulkManagerMode: "replace" | "add";
  setBulkManagerMode: (v: "replace" | "add") => void;
  bulkManagerSearch: string;
  setBulkManagerSearch: (v: string) => void;
  handleBulkUpdateManager: (ids: string[]) => void;

  isBulkTeacherOpen: boolean;
  setIsBulkTeacherOpen: (v: boolean) => void;
  selectedBulkTeachers: string[];
  setSelectedBulkTeachers: (ids: string[]) => void;
  bulkTeacherMode: "replace" | "add";
  setBulkTeacherMode: (v: "replace" | "add") => void;
  bulkTeacherSearch: string;
  setBulkTeacherSearch: (v: string) => void;
  handleBulkUpdateTeacher: (ids: string[]) => void;

  isBulkParentOpen: boolean;
  setIsBulkParentOpen: (v: boolean) => void;
  selectedBulkParents: string[];
  setSelectedBulkParents: (ids: string[]) => void;
  bulkParentMode: "replace" | "add";
  setBulkParentMode: (v: "replace" | "add") => void;
  bulkParentSearch: string;
  setBulkParentSearch: (v: string) => void;
  handleBulkUpdateParent: (ids: string[]) => void;

  isAccountStatusOpen: boolean;
  setIsAccountStatusOpen: (v: boolean) => void;
  selectedAccountStatus: string;
  setSelectedAccountStatus: (v: string) => void;
  isUpdatingAccountStatus: boolean;
  handleBulkUpdateAccountStatus: (ids: string[]) => void;
}

export function BulkActionDialogs({
  selectedIds,
  staff,
  parents,
  locations,
  sortedRelationships,
  updateStudent,

  isBulkRelOpen, setIsBulkRelOpen, selectedBulkRels, setSelectedBulkRels, toggleBulkRel, handleBulkUpdateRelationship,
  isBulkLocationOpen, setIsBulkLocationOpen, selectedBulkLocations, setSelectedBulkLocations, bulkLocationMode, setBulkLocationMode, bulkLocationSearch, setBulkLocationSearch, handleBulkUpdateLocation,
  isBulkSaleOpen, setIsBulkSaleOpen, selectedBulkSales, setSelectedBulkSales, bulkSaleMode, setBulkSaleMode, bulkSaleSearch, setBulkSaleSearch, handleBulkUpdateSale,
  isBulkManagerOpen, setIsBulkManagerOpen, selectedBulkManagers, setSelectedBulkManagers, bulkManagerMode, setBulkManagerMode, bulkManagerSearch, setBulkManagerSearch, handleBulkUpdateManager,
  isBulkTeacherOpen, setIsBulkTeacherOpen, selectedBulkTeachers, setSelectedBulkTeachers, bulkTeacherMode, setBulkTeacherMode, bulkTeacherSearch, setBulkTeacherSearch, handleBulkUpdateTeacher,
  isBulkParentOpen, setIsBulkParentOpen, selectedBulkParents, setSelectedBulkParents, bulkParentMode, setBulkParentMode, bulkParentSearch, setBulkParentSearch, handleBulkUpdateParent,
  isAccountStatusOpen, setIsAccountStatusOpen, selectedAccountStatus, setSelectedAccountStatus, isUpdatingAccountStatus, handleBulkUpdateAccountStatus,
}: BulkActionDialogsProps) {
  const inferredParentIds = useMemo(
    () => new Set(sortedRelationships.map((r) => r.parentId).filter((id): id is string => Boolean(id))),
    [sortedRelationships]
  );
  const isParentRelationship = (relationship: CrmRelationship) =>
    !relationship.isSystemDefault && Boolean(relationship.isParentGroup || inferredParentIds.has(relationship.id));
  const bulkParentGroups = useMemo(
    () => sortedRelationships.filter((r) => isParentRelationship(r)),
    [sortedRelationships, inferredParentIds]
  );
  const bulkChildByParent = useMemo(() => {
    const map = new Map<string, CrmRelationship[]>();
    sortedRelationships.filter((r) => !r.isSystemDefault && !isParentRelationship(r) && r.parentId).forEach((r) => {
      if (!map.has(r.parentId!)) map.set(r.parentId!, []);
      map.get(r.parentId!)!.push(r);
    });
    return map;
  }, [sortedRelationships, inferredParentIds]);
  const bulkDirectRelationships = useMemo(
    () => sortedRelationships.filter((r) =>
      r.isSystemDefault
        ? r.isUsed === true
        : !isParentRelationship(r) && !r.parentId
    ),
    [sortedRelationships, inferredParentIds]
  );

  const handleBulkToggleRel = (rel: CrmRelationship) => {
    const isSelected = selectedBulkRels.includes(rel.id);
    if (isSelected) {
      setSelectedBulkRels(selectedBulkRels.filter((id) => id !== rel.id));
    } else if (rel.parentId && !rel.isSystemDefault && !isParentRelationship(rel)) {
      const siblingIds = new Set(
        sortedRelationships.filter((r) => !isParentRelationship(r) && r.parentId === rel.parentId && r.id !== rel.id).map((r) => r.id)
      );
      setSelectedBulkRels([...selectedBulkRels.filter((id) => !siblingIds.has(id)), rel.id]);
    } else {
      setSelectedBulkRels([...selectedBulkRels, rel.id]);
    }
  };

  return (
    <>
      <Dialog open={isBulkRelOpen} onOpenChange={setIsBulkRelOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Chuyển mối quan hệ cho {selectedIds.length} học viên
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-1">
            {bulkParentGroups.map((group) => {
              const children = bulkChildByParent.get(group.id) || [];
              if (children.length === 0) return null;
              return (
                <div key={group.id} className="mb-5">
                  <p className="text-sm font-semibold text-foreground mb-2">{group.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {children.map((rel) => {
                      const isSelected = selectedBulkRels.includes(rel.id);
                      const color = rel.color || "#8b5cf6";
                      return (
                        <button
                          key={rel.id}
                          onClick={() => handleBulkToggleRel(rel)}
                          className={cn(
                            "px-2.5 py-0.5 rounded text-xs font-medium border transition-all",
                            isSelected ? "text-white" : "bg-white hover:opacity-80"
                          )}
                          style={isSelected ? { backgroundColor: color, borderColor: color } : { borderColor: color, color }}
                        >
                          {rel.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {bulkDirectRelationships.length > 0 && (
              <div className="mb-2">
                <p className="text-sm font-semibold text-foreground mb-2">Mối quan hệ khác</p>
                <div className="flex flex-wrap gap-2">
                  {bulkDirectRelationships.map((rel) => {
                    const isSelected = selectedBulkRels.includes(rel.id);
                    const color = rel.color || "#3b82f6";
                    return (
                      <button
                        key={rel.id}
                        onClick={() => handleBulkToggleRel(rel)}
                        className={cn(
                          "px-2.5 py-0.5 rounded text-xs font-medium border transition-all",
                          isSelected ? "text-white" : "bg-white hover:opacity-80"
                        )}
                        style={isSelected ? { backgroundColor: color, borderColor: color } : { borderColor: color, color }}
                      >
                        {rel.name}{rel.isSystemDefault ? "*" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
          <div className="flex justify-end gap-3 mt-2">
            <Button variant="outline" onClick={() => { setIsBulkRelOpen(false); setSelectedBulkRels([]); }} className="px-6 h-9 rounded-xl text-sm font-medium">Hủy</Button>
            <Button onClick={() => handleBulkUpdateRelationship(selectedIds)} disabled={selectedBulkRels.length === 0 || updateStudent.isPending} className="px-6 h-9 rounded-xl text-sm font-medium bg-primary hover:bg-primary/90">Lưu</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkLocationOpen} onOpenChange={setIsBulkLocationOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-3xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-bold">Gán cơ sở cho {selectedIds.length} học viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mode" checked={bulkLocationMode === "replace"} onChange={() => setBulkLocationMode("replace")} />
              <span className="text-sm">Thay thế dữ liệu cũ bằng dữ liệu mới</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mode" checked={bulkLocationMode === "add"} onChange={() => setBulkLocationMode("add")} />
              <span className="text-sm">Giữ nguyên dữ liệu cũ & bổ sung dữ liệu mới</span>
            </label>
            <hr />
            <Input placeholder="Tìm kiếm cơ sở..." value={bulkLocationSearch} onChange={(e) => setBulkLocationSearch(e.target.value)} className="rounded-lg" />
            <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
              {locations?.filter((l) => l.name.toLowerCase().includes(bulkLocationSearch.toLowerCase())).map((loc) => (
                <label key={loc.id} className="flex items-center gap-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={selectedBulkLocations.includes(loc.id)} onChange={() => setSelectedBulkLocations(selectedBulkLocations.includes(loc.id) ? selectedBulkLocations.filter((id) => id !== loc.id) : [...selectedBulkLocations, loc.id])} />
                  <span>{loc.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => { setIsBulkLocationOpen(false); setSelectedBulkLocations([]); setBulkLocationSearch(""); }} className="px-8 h-11 rounded-xl">Hủy</Button>
            <Button onClick={() => handleBulkUpdateLocation(selectedIds)} disabled={selectedBulkLocations.length === 0 || updateStudent.isPending} className="px-8 h-11 rounded-xl bg-primary">Cập nhật</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkSaleOpen} onOpenChange={setIsBulkSaleOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-3xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-bold">Gán sale cho {selectedIds.length} học viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="saleMode" checked={bulkSaleMode === "replace"} onChange={() => setBulkSaleMode("replace")} />
              <span className="text-sm">Thay thế dữ liệu cũ bằng dữ liệu mới</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="saleMode" checked={bulkSaleMode === "add"} onChange={() => setBulkSaleMode("add")} />
              <span className="text-sm">Giữ nguyên dữ liệu cũ & bổ sung dữ liệu mới</span>
            </label>
            <hr />
            <Input placeholder="Tìm kiếm nhân viên sales..." value={bulkSaleSearch} onChange={(e) => setBulkSaleSearch(e.target.value)} className="rounded-lg" />
            <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
              {staff?.filter((s) => (s.fullName || "").toLowerCase().includes(bulkSaleSearch.toLowerCase())).map((person) => (
                <label key={person.id} className="flex items-center gap-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={selectedBulkSales.includes(person.id)} onChange={() => setSelectedBulkSales(selectedBulkSales.includes(person.id) ? selectedBulkSales.filter((id) => id !== person.id) : [...selectedBulkSales, person.id])} />
                  <div><div>{person.fullName}</div><div className="text-xs text-gray-500">@{person.code}</div></div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => { setIsBulkSaleOpen(false); setSelectedBulkSales([]); setBulkSaleSearch(""); }} className="px-8 h-11 rounded-xl">Hủy</Button>
            <Button onClick={() => handleBulkUpdateSale(selectedIds)} disabled={selectedBulkSales.length === 0 || updateStudent.isPending} className="px-8 h-11 rounded-xl bg-primary">Cập nhật</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkManagerOpen} onOpenChange={setIsBulkManagerOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-3xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-bold">Gán quản lý cho {selectedIds.length} học viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="managerMode" checked={bulkManagerMode === "replace"} onChange={() => setBulkManagerMode("replace")} />
              <span className="text-sm">Thay thế dữ liệu cũ bằng dữ liệu mới</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="managerMode" checked={bulkManagerMode === "add"} onChange={() => setBulkManagerMode("add")} />
              <span className="text-sm">Giữ nguyên dữ liệu cũ & bổ sung dữ liệu mới</span>
            </label>
            <hr />
            <Input placeholder="Tìm kiếm quản lý..." value={bulkManagerSearch} onChange={(e) => setBulkManagerSearch(e.target.value)} className="rounded-lg" />
            <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
              {staff?.filter((s) => (s.fullName || "").toLowerCase().includes(bulkManagerSearch.toLowerCase())).map((person) => (
                <label key={person.id} className="flex items-center gap-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={selectedBulkManagers.includes(person.id)} onChange={() => setSelectedBulkManagers(selectedBulkManagers.includes(person.id) ? selectedBulkManagers.filter((id) => id !== person.id) : [...selectedBulkManagers, person.id])} />
                  <div><div>{person.fullName}</div><div className="text-xs text-gray-500">@{person.code}</div></div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => { setIsBulkManagerOpen(false); setSelectedBulkManagers([]); setBulkManagerSearch(""); }} className="px-8 h-11 rounded-xl">Hủy</Button>
            <Button onClick={() => handleBulkUpdateManager(selectedIds)} disabled={selectedBulkManagers.length === 0 || updateStudent.isPending} className="px-8 h-11 rounded-xl bg-primary">Cập nhật</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkTeacherOpen} onOpenChange={setIsBulkTeacherOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-3xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-bold">Gán giáo viên cho {selectedIds.length} học viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="teacherMode" checked={bulkTeacherMode === "replace"} onChange={() => setBulkTeacherMode("replace")} />
              <span className="text-sm">Thay thế dữ liệu cũ bằng dữ liệu mới</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="teacherMode" checked={bulkTeacherMode === "add"} onChange={() => setBulkTeacherMode("add")} />
              <span className="text-sm">Giữ nguyên dữ liệu cũ & bổ sung dữ liệu mới</span>
            </label>
            <hr />
            <Input placeholder="Tìm kiếm giáo viên..." value={bulkTeacherSearch} onChange={(e) => setBulkTeacherSearch(e.target.value)} className="rounded-lg" />
            <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
              {staff?.filter((s) => (s.fullName || "").toLowerCase().includes(bulkTeacherSearch.toLowerCase())).map((person) => (
                <label key={person.id} className="flex items-center gap-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={selectedBulkTeachers.includes(person.id)} onChange={() => setSelectedBulkTeachers(selectedBulkTeachers.includes(person.id) ? selectedBulkTeachers.filter((id) => id !== person.id) : [...selectedBulkTeachers, person.id])} />
                  <div><div>{person.fullName}</div><div className="text-xs text-gray-500">@{person.code}</div></div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => { setIsBulkTeacherOpen(false); setSelectedBulkTeachers([]); setBulkTeacherSearch(""); }} className="px-8 h-11 rounded-xl">Hủy</Button>
            <Button onClick={() => handleBulkUpdateTeacher(selectedIds)} disabled={selectedBulkTeachers.length === 0 || updateStudent.isPending} className="px-8 h-11 rounded-xl bg-primary">Cập nhật</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkParentOpen} onOpenChange={setIsBulkParentOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-3xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-bold">Gán phụ huynh cho {selectedIds.length} học viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="parentMode" checked={bulkParentMode === "replace"} onChange={() => setBulkParentMode("replace")} />
              <span className="text-sm">Thay thế dữ liệu cũ bằng dữ liệu mới</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="parentMode" checked={bulkParentMode === "add"} onChange={() => setBulkParentMode("add")} />
              <span className="text-sm">Giữ nguyên dữ liệu cũ & bổ sung dữ liệu mới</span>
            </label>
            <hr />
            <Input placeholder="Tìm kiếm phụ huynh..." value={bulkParentSearch} onChange={(e) => setBulkParentSearch(e.target.value)} className="rounded-lg" />
            <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
              {parents?.filter((p) => (p.fullName || "").toLowerCase().includes(bulkParentSearch.toLowerCase())).map((person) => (
                <label key={person.id} className="flex items-center gap-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={selectedBulkParents.includes(person.id)} onChange={() => setSelectedBulkParents(selectedBulkParents.includes(person.id) ? selectedBulkParents.filter((id) => id !== person.id) : [...selectedBulkParents, person.id])} />
                  <div><div>{person.fullName}</div><div className="text-xs text-gray-500">@{person.code}</div></div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => { setIsBulkParentOpen(false); setSelectedBulkParents([]); setBulkParentSearch(""); }} className="px-8 h-11 rounded-xl">Hủy</Button>
            <Button onClick={() => handleBulkUpdateParent(selectedIds)} disabled={selectedBulkParents.length === 0 || updateStudent.isPending} className="px-8 h-11 rounded-xl bg-primary">Cập nhật</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAccountStatusOpen} onOpenChange={setIsAccountStatusOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thay đổi trạng thái tài khoản cho {selectedIds.length} học viên</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Chọn trạng thái tài khoản</label>
              <select
                value={selectedAccountStatus}
                onChange={(e) => setSelectedAccountStatus(e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="Hoạt động">Hoạt động</option>
                <option value="Không hoạt động">Không hoạt động</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setIsAccountStatusOpen(false)}>Hủy</Button>
              <Button onClick={() => handleBulkUpdateAccountStatus(selectedIds)} disabled={isUpdatingAccountStatus}>
                {isUpdatingAccountStatus ? "Đang cập nhật..." : "Cập nhật"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
