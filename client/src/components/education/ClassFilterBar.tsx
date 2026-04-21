import { Search, Filter, MapPin, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ClassFilterBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  locationFilter: string;
  onLocationChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  locations: any[] | undefined;
  onOpenActivityLog?: () => void;
}

export function ClassFilterBar({
  searchTerm,
  onSearchChange,
  locationFilter,
  onLocationChange,
  statusFilter,
  onStatusChange,
  locations,
  onOpenActivityLog,
}: ClassFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
      <div className="relative flex-1 min-w-[240px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Mã lớp, tên lớp, giáo viên..."
          className="pl-9 bg-background border-border"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="input-search-classes"
        />
      </div>
      <Select value={locationFilter} onValueChange={onLocationChange}>
        <SelectTrigger className="w-[180px]">
          <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
          <SelectValue placeholder="Cơ sở" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả cơ sở</SelectItem>
          {locations?.map((loc) => (
            <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[180px]">
          <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
          <SelectValue placeholder="Trạng thái" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả trạng thái</SelectItem>
          <SelectItem value="recruiting">Đang tuyển sinh</SelectItem>
          <SelectItem value="active">Đang học</SelectItem>
          <SelectItem value="closed">Kết thúc</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" className="gap-2">
        <Filter className="h-4 w-4" />Lọc thêm
      </Button>
      <Button
        variant="outline"
        className="gap-2"
        data-testid="button-nhat-ky"
        onClick={onOpenActivityLog}
      >
        <BookOpen className="h-4 w-4" />Nhật ký
      </Button>
    </div>
  );
}
