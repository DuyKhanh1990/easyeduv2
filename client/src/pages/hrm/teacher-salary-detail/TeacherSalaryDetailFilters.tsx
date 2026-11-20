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
    <div className="border-b border-slate-200 dark:border-gray-800 px-5 py-2 bg-white dark:bg-gray-950 shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Filter className="h-3.5 w-3.5" />
          <span className="font-semibold uppercase tracking-wide">Lọc:</span>
        </div>

        <Select value={filterTeacher} onValueChange={setFilterTeacher}>
          <SelectTrigger
            className="h-8 w-[175px] text-xs bg-slate-50 dark:bg-gray-900 border-slate-200 dark:border-gray-700 hover:border-indigo-300 focus:ring-indigo-500 transition-colors"
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
            className="h-8 w-[165px] text-xs bg-slate-50 dark:bg-gray-900 border-slate-200 dark:border-gray-700 hover:border-indigo-300 focus:ring-indigo-500 transition-colors"
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
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              className="h-8 pl-8 w-[200px] text-xs bg-slate-50 dark:bg-gray-900 border-slate-200 dark:border-gray-700 hover:border-indigo-300 focus:border-indigo-400 transition-colors"
              placeholder="Tìm giáo viên..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              data-testid="input-search-teacher"
            />
          </div>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-40 transition-colors"
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
