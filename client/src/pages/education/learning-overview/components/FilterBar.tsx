import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, X, SlidersHorizontal } from "lucide-react";

type FilterOption = { code: string; label: string };

export type StatusFilterValue = "" | "active" | "ending-soon" | "ended";

type FilterBarProps = {
  search: string;
  onSearchChange: (v: string) => void;
  availableClasses: FilterOption[];
  selectedClasses: string[];
  onSelectedClassesChange: (v: string[]) => void;
  maxRemaining: string;
  onMaxRemainingChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  statusFilter: StatusFilterValue;
  onStatusFilterChange: (v: StatusFilterValue) => void;
  searchPlaceholder?: string;
};

export function FilterBar({
  search,
  onSearchChange,
  availableClasses,
  selectedClasses,
  onSelectedClassesChange,
  maxRemaining,
  onMaxRemainingChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  statusFilter,
  onStatusFilterChange,
  searchPlaceholder = "Tìm kiếm...",
}: FilterBarProps) {
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [classSearch, setClassSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setClassDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = availableClasses.filter((opt) =>
    opt.label.toLowerCase().includes(classSearch.toLowerCase())
  );

  const toggleClass = (code: string) => {
    if (selectedClasses.includes(code)) {
      onSelectedClassesChange(selectedClasses.filter((c) => c !== code));
    } else {
      onSelectedClassesChange([...selectedClasses, code]);
    }
  };

  const clearAll = () => {
    onSearchChange("");
    onSelectedClassesChange([]);
    onMaxRemainingChange("");
    onDateFromChange("");
    onDateToChange("");
    onStatusFilterChange("");
  };

  const hasActiveFilters =
    search || selectedClasses.length > 0 || maxRemaining || dateFrom || dateTo || statusFilter;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            className="pl-10 h-9 text-sm"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            data-testid="input-filter-search"
          />
        </div>

        <div className="relative" ref={dropdownRef}>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-sm"
            onClick={() => setClassDropdownOpen((o) => !o)}
            data-testid="button-filter-class"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Lọc lớp học
            {selectedClasses.length > 0 && (
              <Badge className="bg-primary text-primary-foreground text-[10px] h-4 px-1 ml-0.5">
                {selectedClasses.length}
              </Badge>
            )}
            <ChevronDown className="h-3.5 w-3.5 ml-0.5" />
          </Button>

          {classDropdownOpen && (
            <div className="absolute z-50 top-10 left-0 bg-background border border-border rounded-lg shadow-lg w-64 p-2">
              <Input
                placeholder="Tìm lớp..."
                className="h-8 text-sm mb-2"
                value={classSearch}
                onChange={(e) => setClassSearch(e.target.value)}
                data-testid="input-filter-class-search"
              />
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {filteredOptions.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-3">
                    Không tìm thấy
                  </div>
                ) : (
                  filteredOptions.map((opt) => (
                    <label
                      key={opt.code}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedClasses.includes(opt.code)}
                        onChange={() => toggleClass(opt.code)}
                        className="rounded"
                        data-testid={`checkbox-class-${opt.code}`}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))
                )}
              </div>
              {selectedClasses.length > 0 && (
                <div className="border-t mt-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs"
                    onClick={() => onSelectedClassesChange([])}
                  >
                    Bỏ chọn tất cả
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as StatusFilterValue)}
          data-testid="select-filter-status"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ending-soon">Sắp kết thúc</option>
          <option value="active">Đang học</option>
          <option value="ended">Đã kết thúc</option>
        </select>

        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Còn lại ≤</span>
          <Input
            type="number"
            min={0}
            placeholder="Buổi"
            className="h-9 w-20 text-sm"
            value={maxRemaining}
            onChange={(e) => onMaxRemainingChange(e.target.value)}
            data-testid="input-filter-max-remaining"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Kết thúc từ</span>
          <Input
            type="date"
            className="h-9 text-sm w-36"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            data-testid="input-filter-date-from"
          />
          <span className="text-sm text-muted-foreground">đến</span>
          <Input
            type="date"
            className="h-9 text-sm w-36"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            data-testid="input-filter-date-to"
          />
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-sm gap-1.5 text-muted-foreground"
            onClick={clearAll}
            data-testid="button-clear-filters"
          >
            <X className="h-3.5 w-3.5" />
            Xóa bộ lọc
          </Button>
        )}
      </div>

      {selectedClasses.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedClasses.map((code) => (
            <Badge
              key={code}
              variant="secondary"
              className="text-xs gap-1 cursor-pointer"
              onClick={() => toggleClass(code)}
              data-testid={`badge-selected-class-${code}`}
            >
              {code}
              <X className="h-2.5 w-2.5" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
