import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { StudentResponse } from "@shared/schema";

interface UpdateStudentMutation {
  mutateAsync: (args: { id: string } & Record<string, unknown>) => Promise<unknown>;
}

interface DeleteStudentMutation {
  mutate: (id: string) => void;
}

interface ParentRecord {
  id: string;
  fullName: string;
  phone?: string | null;
}

interface BulkActionsOptions {
  students: StudentResponse[];
  updateStudent: UpdateStudentMutation;
  deleteStudent: DeleteStudentMutation;
  setSelectedIds: (ids: string[]) => void;
  parents?: ParentRecord[];
}

export function useCustomersBulkActions({
  students,
  updateStudent,
  deleteStudent,
  setSelectedIds,
  parents = [],
}: BulkActionsOptions) {
  const { toast } = useToast();

  const [isBulkRelOpen, setIsBulkRelOpen] = useState(false);
  const [selectedBulkRels, setSelectedBulkRels] = useState<string[]>([]);
  const toggleBulkRel = (id: string) =>
    setSelectedBulkRels((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]));

  const [isBulkLocationOpen, setIsBulkLocationOpen] = useState(false);
  const [selectedBulkLocations, setSelectedBulkLocations] = useState<string[]>([]);
  const [bulkLocationMode, setBulkLocationMode] = useState<"replace" | "add">("replace");
  const [bulkLocationSearch, setBulkLocationSearch] = useState("");

  const [isBulkSaleOpen, setIsBulkSaleOpen] = useState(false);
  const [selectedBulkSales, setSelectedBulkSales] = useState<string[]>([]);
  const [bulkSaleMode, setBulkSaleMode] = useState<"replace" | "add">("replace");
  const [bulkSaleSearch, setBulkSaleSearch] = useState("");

  const [isBulkManagerOpen, setIsBulkManagerOpen] = useState(false);
  const [selectedBulkManagers, setSelectedBulkManagers] = useState<string[]>([]);
  const [bulkManagerMode, setBulkManagerMode] = useState<"replace" | "add">("replace");
  const [bulkManagerSearch, setBulkManagerSearch] = useState("");

  const [isBulkTeacherOpen, setIsBulkTeacherOpen] = useState(false);
  const [selectedBulkTeachers, setSelectedBulkTeachers] = useState<string[]>([]);
  const [bulkTeacherMode, setBulkTeacherMode] = useState<"replace" | "add">("replace");
  const [bulkTeacherSearch, setBulkTeacherSearch] = useState("");

  const [isBulkParentOpen, setIsBulkParentOpen] = useState(false);
  const [selectedBulkParents, setSelectedBulkParents] = useState<string[]>([]);
  const [bulkParentMode, setBulkParentMode] = useState<"replace" | "add">("replace");
  const [bulkParentSearch, setBulkParentSearch] = useState("");

  const [isAccountStatusOpen, setIsAccountStatusOpen] = useState(false);
  const [selectedAccountStatus, setSelectedAccountStatus] = useState("Hoạt động");
  const [isUpdatingAccountStatus, setIsUpdatingAccountStatus] = useState(false);

  const [isAssignClassOpen, setIsAssignClassOpen] = useState(false);

  const runBulkUpdate = (
    selectedIds: string[],
    getPayload: (student: StudentResponse | undefined) => Record<string, unknown>,
    successMsg: string,
    onSuccess: () => void
  ) => {
    const promises = selectedIds.map((id) => {
      const student = students.find((s) => s.id === id);
      return updateStudent.mutateAsync({ id, ...getPayload(student) });
    });
    Promise.all(promises)
      .then(() => {
        toast({ title: "Thành công", description: successMsg });
        onSuccess();
      })
      .catch(() => {
        toast({ title: "Lỗi", description: "Có lỗi xảy ra khi cập nhật.", variant: "destructive" });
      });
  };

  const handleBulkUpdateRelationship = (selectedIds: string[]) => {
    if (!selectedIds.length || !selectedBulkRels.length) return;
    runBulkUpdate(
      selectedIds,
      () => ({ relationshipIds: selectedBulkRels }),
      `Đã cập nhật mối quan hệ cho ${selectedIds.length} học viên.`,
      () => { setIsBulkRelOpen(false); setSelectedIds([]); setSelectedBulkRels([]); }
    );
  };

  const handleBulkUpdateLocation = (selectedIds: string[]) => {
    if (!selectedIds.length || !selectedBulkLocations.length) return;
    runBulkUpdate(
      selectedIds,
      (student) => {
        const existing = student?.locations?.map((l) => l.locationId) || [];
        const final =
          bulkLocationMode === "replace"
            ? selectedBulkLocations
            : Array.from(new Set([...existing, ...selectedBulkLocations]));
        return { locationIds: final };
      },
      `Đã cập nhật cơ sở cho ${selectedIds.length} học viên.`,
      () => {
        setIsBulkLocationOpen(false);
        setSelectedIds([]);
        setSelectedBulkLocations([]);
        setBulkLocationMode("replace");
        setBulkLocationSearch("");
      }
    );
  };

  const handleBulkUpdateSale = (selectedIds: string[]) => {
    if (!selectedIds.length || !selectedBulkSales.length) return;
    runBulkUpdate(
      selectedIds,
      (student) => {
        const existing = student?.salesByIds || [];
        const final =
          bulkSaleMode === "replace"
            ? selectedBulkSales
            : [...existing, ...selectedBulkSales].filter((id, idx, arr) => arr.indexOf(id) === idx);
        return { salesByIds: final };
      },
      `Đã cập nhật sale cho ${selectedIds.length} học viên.`,
      () => {
        setIsBulkSaleOpen(false);
        setSelectedIds([]);
        setSelectedBulkSales([]);
        setBulkSaleMode("replace");
        setBulkSaleSearch("");
      }
    );
  };

  const handleBulkUpdateManager = (selectedIds: string[]) => {
    if (!selectedIds.length || !selectedBulkManagers.length) return;
    runBulkUpdate(
      selectedIds,
      (student) => {
        const existing = student?.managedByIds || [];
        const final =
          bulkManagerMode === "replace"
            ? selectedBulkManagers
            : [...existing, ...selectedBulkManagers].filter((id, idx, arr) => arr.indexOf(id) === idx);
        return { managedByIds: final };
      },
      `Đã cập nhật quản lý cho ${selectedIds.length} học viên.`,
      () => {
        setIsBulkManagerOpen(false);
        setSelectedIds([]);
        setSelectedBulkManagers([]);
        setBulkManagerMode("replace");
        setBulkManagerSearch("");
      }
    );
  };

  const handleBulkUpdateTeacher = (selectedIds: string[]) => {
    if (!selectedIds.length || !selectedBulkTeachers.length) return;
    runBulkUpdate(
      selectedIds,
      (student) => {
        const existing = student?.teacherIds || [];
        const final =
          bulkTeacherMode === "replace"
            ? selectedBulkTeachers
            : [...existing, ...selectedBulkTeachers].filter((id, idx, arr) => arr.indexOf(id) === idx);
        return { teacherIds: final };
      },
      `Đã cập nhật giáo viên cho ${selectedIds.length} học viên.`,
      () => {
        setIsBulkTeacherOpen(false);
        setSelectedIds([]);
        setSelectedBulkTeachers([]);
        setBulkTeacherMode("replace");
        setBulkTeacherSearch("");
      }
    );
  };

  const handleBulkUpdateParent = (selectedIds: string[]) => {
    if (!selectedIds.length || !selectedBulkParents.length) return;

    // Look up selected parent records for name/phone
    const selectedParentRecords = selectedBulkParents
      .map((id) => parents.find((p) => p.id === id))
      .filter(Boolean) as ParentRecord[];

    runBulkUpdate(
      selectedIds,
      (student) => {
        const s = student as any;
        const existingIds: string[] = s?.parentIds || [];
        const finalIds =
          bulkParentMode === "replace"
            ? selectedBulkParents
            : [...existingIds, ...selectedBulkParents].filter((id, idx, arr) => arr.indexOf(id) === idx);

        const updates: Record<string, unknown> = { parentIds: finalIds };

        if (bulkParentMode === "replace") {
          // Replace mode: assign parents to slots in order
          updates.parentName = selectedParentRecords[0]?.fullName || "";
          updates.parentPhone = selectedParentRecords[0]?.phone || "";
          updates.parentName2 = selectedParentRecords[1]?.fullName || "";
          updates.parentPhone2 = selectedParentRecords[1]?.phone || "";
          updates.parentName3 = selectedParentRecords[2]?.fullName || "";
          updates.parentPhone3 = selectedParentRecords[2]?.phone || "";
        } else {
          // Add mode: find first empty slot(s) and fill them
          const slots = [
            { name: s?.parentName || "", phone: s?.parentPhone || "", key: "parentName", phoneKey: "parentPhone" },
            { name: s?.parentName2 || "", phone: s?.parentPhone2 || "", key: "parentName2", phoneKey: "parentPhone2" },
            { name: s?.parentName3 || "", phone: s?.parentPhone3 || "", key: "parentName3", phoneKey: "parentPhone3" },
          ];
          let parentIdx = 0;
          for (const slot of slots) {
            if (!slot.name && parentIdx < selectedParentRecords.length) {
              updates[slot.key] = selectedParentRecords[parentIdx]?.fullName || "";
              updates[slot.phoneKey] = selectedParentRecords[parentIdx]?.phone || "";
              parentIdx++;
            }
          }
        }

        return updates;
      },
      `Đã cập nhật phụ huynh cho ${selectedIds.length} học viên.`,
      () => {
        setIsBulkParentOpen(false);
        setSelectedIds([]);
        setSelectedBulkParents([]);
        setBulkParentMode("replace");
        setBulkParentSearch("");
      }
    );
  };

  const handleBulkUpdateAccountStatus = async (selectedIds: string[]) => {
    setIsUpdatingAccountStatus(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          updateStudent.mutateAsync({ id, accountStatus: selectedAccountStatus })
        )
      );
      toast({
        title: "Thành công",
        description: `Đã cập nhật trạng thái tài khoản cho ${selectedIds.length} học viên`,
      });
      setIsAccountStatusOpen(false);
      setSelectedIds([]);
      setSelectedAccountStatus("Hoạt động");
    } catch (error) {
      toast({
        title: "Lỗi",
        description: error instanceof Error ? error.message : "Không thể cập nhật trạng thái tài khoản",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingAccountStatus(false);
    }
  };

  const handleBulkDelete = (selectedIds: string[]) => {
    if (!confirm(`Bạn có chắc chắn muốn xoá ${selectedIds.length} học viên đã chọn?`)) return;
    selectedIds.forEach((id) => deleteStudent.mutate(id));
    setSelectedIds([]);
    toast({ title: "Thành công", description: `Đã xoá ${selectedIds.length} học viên.` });
  };

  return {
    isBulkRelOpen, setIsBulkRelOpen, selectedBulkRels, setSelectedBulkRels, toggleBulkRel, handleBulkUpdateRelationship,
    isBulkLocationOpen, setIsBulkLocationOpen, selectedBulkLocations, setSelectedBulkLocations, bulkLocationMode, setBulkLocationMode, bulkLocationSearch, setBulkLocationSearch, handleBulkUpdateLocation,
    isBulkSaleOpen, setIsBulkSaleOpen, selectedBulkSales, setSelectedBulkSales, bulkSaleMode, setBulkSaleMode, bulkSaleSearch, setBulkSaleSearch, handleBulkUpdateSale,
    isBulkManagerOpen, setIsBulkManagerOpen, selectedBulkManagers, setSelectedBulkManagers, bulkManagerMode, setBulkManagerMode, bulkManagerSearch, setBulkManagerSearch, handleBulkUpdateManager,
    isBulkTeacherOpen, setIsBulkTeacherOpen, selectedBulkTeachers, setSelectedBulkTeachers, bulkTeacherMode, setBulkTeacherMode, bulkTeacherSearch, setBulkTeacherSearch, handleBulkUpdateTeacher,
    isBulkParentOpen, setIsBulkParentOpen, selectedBulkParents, setSelectedBulkParents, bulkParentMode, setBulkParentMode, bulkParentSearch, setBulkParentSearch, handleBulkUpdateParent,
    isAccountStatusOpen, setIsAccountStatusOpen, selectedAccountStatus, setSelectedAccountStatus, isUpdatingAccountStatus, handleBulkUpdateAccountStatus,
    isAssignClassOpen, setIsAssignClassOpen,
    handleBulkDelete,
  };
}
