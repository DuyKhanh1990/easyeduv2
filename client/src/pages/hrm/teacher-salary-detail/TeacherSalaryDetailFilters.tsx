import { Filter, Search, Send } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { TeacherSalaryDetailRow } from "@/hooks/use-teacher-salary";
import type { TeacherSalaryPackage } from "@/hooks/use-teacher-salary-packages";

type Props = {
  rows: TeacherSalaryDetailRow[];
  filterTeacher: string;
  setFilterTeacher: (v: string) => void;
  filterPackage: string;
  setFilterPackage: (v: string) => void;
  searchText: string;
  setSearchText: (v: string) => void;
  packages: TeacherSalaryPackage[];
  selectedCount: number;
  onPublish: () => void;
  isPublishing: boolean;
};

export function TeacherSalaryDetailFilters({
  rows,
  filterTeacher,
  setFilterTeacher,
  filterPackage,
  setFilterPackage,
  searchText,
  setSearchText,
  packages,
  selectedCount,
  onPublish,
  isPublishing,
}: Props) {
  const uniqueTeachers = Array.from(
    new Map(rows.map((r) => [r.teacherId, { id: r.teacherId, name: r.teacherName }])).values()
  );

  return (
    <div className="border-b px-6 py-2.5 bg-gray-50 dark:bg-gray-900 shrink-0">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span className="font-medium">Lọc:</span>
        </div>

        <Select value={filterTeacher} onValueChange={setFilterTeacher}>
          <SelectTrigger
            className="h-8 w-[180px] text-sm bg-white dark:bg-gray-800"
            data-testid="filter-teacher"
          >
            <SelectValue placeholder="Tất cả giáo viên" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả giáo viên</SelectItem>
            {uniqueTeachers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPackage} onValueChange={setFilterPackage}>
          <SelectTrigger
            className="h-8 w-[170px] text-sm bg-white dark:bg-gray-800"
            data-testid="filter-salary-package"
          >
            <SelectValue placeholder="Tất cả gói lương" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả gói lương</SelectItem>
            {packages.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="h-8 pl-8 w-[200px] text-sm bg-white dark:bg-gray-800"
              placeholder="Tìm giáo viên..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              data-testid="input-search-teacher"
            />
          </div>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
            disabled={selectedCount === 0 || isPublishing}
            onClick={onPublish}
            data-testid="button-publish-rows"
          >
            <Send className="h-3.5 w-3.5" />
            Công bố{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
