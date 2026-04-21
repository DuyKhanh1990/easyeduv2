import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AddStudentToSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  filteredCandidates: any[];
  allCandidates: any[];
  isLoading: boolean;
  onConfirm: (students: { studentId: string; fullName: string; code: string; source: string }[]) => void;
}

export function AddStudentToSessionDialog({
  open,
  onOpenChange,
  searchTerm,
  onSearchChange,
  selectedIds,
  onSelectionChange,
  filteredCandidates,
  allCandidates,
  isLoading,
  onConfirm,
}: AddStudentToSessionDialogProps) {
  const handleCancel = () => {
    onOpenChange(false);
    onSelectionChange([]);
    onSearchChange("");
  };

  const handleConfirm = () => {
    const selected = allCandidates.filter((s) => selectedIds.includes(s.id));
    const formatted = selected.map((s) => ({
      studentId: s.id,
      fullName: s.fullName,
      code: s.code,
      source: s.source,
    }));
    onConfirm(formatted);
    onOpenChange(false);
  };

  const allChecked =
    selectedIds.length === filteredCandidates?.length &&
    filteredCandidates?.length > 0;

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(filteredCandidates?.map((s) => s.id) || []);
    } else {
      onSelectionChange([]);
    }
  };

  const handleToggleOne = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="default"
          size="sm"
          className="h-7 px-2 text-[10px] flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
        >
          <UserPlus className="h-3 w-3" />
          Thêm học viên
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Thêm học viên vào buổi học</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên / mã học viên..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div className="rounded-lg border max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(checked) => handleToggleAll(!!checked)}
                    />
                  </TableHead>
                  <TableHead>Tên</TableHead>
                  <TableHead>Mã</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCandidates.length > 0 ? (
                  filteredCandidates.map((student: any) => (
                    <TableRow key={student.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(student.id)}
                          onCheckedChange={(checked) =>
                            handleToggleOne(student.id, !!checked)
                          }
                        />
                      </TableCell>
                      <TableCell>{student.fullName}</TableCell>
                      <TableCell>{student.code}</TableCell>
                      <TableCell>
                        {student.source === "enrolled" ? (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            Đã trong lớp
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            Chưa vào lớp
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Không có học viên nào để thêm
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleCancel}>
            Hủy
          </Button>
          <Button disabled={selectedIds.length === 0} onClick={handleConfirm}>
            {`Thêm vào buổi (${selectedIds.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
