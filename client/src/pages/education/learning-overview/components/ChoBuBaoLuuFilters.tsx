import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { StoreDateRangePicker, type DateRange } from "@/pages/store/StoreDateRangePicker";
import { ChoBuBaoLuuFilters as FilterState } from "../hooks/useChoBuBaoLuuTab";

type FilterOption = { id: string; label: string };

function MultiSelectFilter({
  label,
  placeholder,
  options,
  selected,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((option) => option.label.toLowerCase().includes(keyword));
  }, [options, search]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  };

  return (
    <Popover open={open} onOpenChange={(value) => {
      setOpen(value);
      if (!value) setSearch("");
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 min-w-[155px] justify-between gap-2 text-sm font-normal"
          data-testid={`filter-${label}`}
        >
          <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
            {selected.length > 0 ? `${label}: ${selected.length} đã chọn` : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Tìm ${label.toLowerCase()}...`}
            className="h-9 pl-8"
            autoFocus
          />
        </div>
        <ScrollArea className="h-52">
          <div className="space-y-1 pr-2">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">Không có kết quả</div>
            ) : (
              filteredOptions.map((option) => {
                const checked = selected.includes(option.id);
                return (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => toggle(option.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={checked}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={() => toggle(option.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {checked && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
        {selected.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-8 w-full text-xs"
            onClick={() => onChange([])}
          >
            Bỏ chọn tất cả
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ChoBuBaoLuuFilters({
  filters,
  onFiltersChange,
  availableClasses,
  availableTeachers,
}: {
  filters: FilterState;
  onFiltersChange: (patch: Partial<FilterState>) => void;
  availableClasses: FilterOption[];
  availableTeachers: FilterOption[];
}) {
  const hasFilters =
    filters.search.trim() !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.classIds.length > 0 ||
    filters.teacherIds.length > 0;

  const dateRange: DateRange = {
    from: filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : undefined,
    to: filters.dateTo ? new Date(`${filters.dateTo}T00:00:00`) : undefined,
  };

  const handleDateRangeChange = (range: DateRange) => {
    const dateFrom = range.from ? format(range.from, "yyyy-MM-dd") : "";
    const dateTo = range.to
      ? format(range.to, "yyyy-MM-dd")
      : dateFrom;
    onFiltersChange({ dateFrom, dateTo });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(event) => onFiltersChange({ search: event.target.value })}
          placeholder="Tìm theo tên hoặc mã học viên..."
          className="h-9 pl-8 text-sm"
          data-testid="input-cho-bu-search"
        />
      </div>

      <StoreDateRangePicker
        value={dateRange}
        onChange={handleDateRangeChange}
        placeholder="Chọn khoảng ngày học"
        className="w-[240px] justify-start"
      />

      <MultiSelectFilter
        label="Lớp"
        placeholder="Lọc theo lớp"
        options={availableClasses}
        selected={filters.classIds}
        onChange={(classIds) => onFiltersChange({ classIds })}
      />
      <MultiSelectFilter
        label="Giáo viên"
        placeholder="Lọc theo giáo viên"
        options={availableTeachers}
        selected={filters.teacherIds}
        onChange={(teacherIds) => onFiltersChange({ teacherIds })}
      />

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1 text-muted-foreground"
          onClick={() => onFiltersChange({ search: "", dateFrom: "", dateTo: "", classIds: [], teacherIds: [] })}
          data-testid="button-clear-cho-bu-filters"
        >
          <X className="h-3.5 w-3.5" />
          Xóa lọc
        </Button>
      )}
    </div>
  );
}