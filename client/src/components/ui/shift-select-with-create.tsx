import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface ShiftSelectWithCreateProps {
  value: string;
  onValueChange: (value: string) => void;
  locationId?: string;
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
}

const CREATE_NEW_VALUE = "__create_new__";

export function ShiftSelectWithCreate({
  value,
  onValueChange,
  locationId,
  placeholder = "Chọn ca học",
  disabled = false,
  triggerClassName,
}: ShiftSelectWithCreateProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const { data: shifts = [] } = useQuery<any[]>({
    queryKey: ["/api/shift-templates", { locationId }],
    queryFn: async () => {
      const params = new URLSearchParams({ type: "class" });
      if (locationId && locationId !== "undefined") params.set("locationId", locationId);
      const res = await fetch(`/api/shift-templates?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
    enabled: !!locationId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; startTime: string; endTime: string; locationId: string }) => {
      const res = await apiRequest("POST", "/api/shift-templates", {
        ...data,
        type: "class",
        lunchBreakMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        workUnits: "1",
      });
      return res.json();
    },
    onSuccess: async (newShift) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/shift-templates"] });
      toast({ title: "Tạo ca thành công", description: `Ca "${newShift.name}" đã được thêm và chọn.` });
      onValueChange(newShift.id);
      setDialogOpen(false);
      setName("");
      setStartTime("");
      setEndTime("");
    },
    onError: (err: any) => {
      toast({
        title: "Lỗi tạo ca",
        description: err?.message || "Không thể tạo ca học. Vui lòng thử lại.",
        variant: "destructive",
      });
    },
  });

  const handleSelectChange = (val: string) => {
    if (val === CREATE_NEW_VALUE) {
      setDialogOpen(true);
    } else {
      onValueChange(val);
    }
  };

  const handleCreate = () => {
    if (!name.trim() || !startTime || !endTime || !locationId) return;
    createMutation.mutate({ name: name.trim(), startTime, endTime, locationId });
  };

  const selectedShift = shifts.find((s) => s.id === value);

  return (
    <>
      <Select
        value={value || ""}
        onValueChange={handleSelectChange}
        disabled={disabled}
      >
        <SelectTrigger className={cn(triggerClassName)}>
          <SelectValue placeholder={placeholder}>
            {selectedShift
              ? `${selectedShift.name} (${selectedShift.startTime}-${selectedShift.endTime})`
              : placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {shifts.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name} ({s.startTime}-{s.endTime})
            </SelectItem>
          ))}
          <div className="border-t mt-1 pt-1">
            <SelectItem value={CREATE_NEW_VALUE} className="text-primary font-medium">
              <span className="flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Thêm ca mới...
              </span>
            </SelectItem>
          </div>
        </SelectContent>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[380px]" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Tạo ca học mới</DialogTitle>
            <DialogDescription>
              Nhập thông tin ca học. Ca sẽ được tạo và tự động chọn.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>
                Tên ca <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="VD: Ca sáng, Ca 1..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-shift-name"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Giờ bắt đầu <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  data-testid="input-shift-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Giờ kết thúc <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  data-testid="input-shift-end"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={createMutation.isPending}
            >
              Hủy
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || !startTime || !endTime || !locationId || createMutation.isPending}
              data-testid="btn-create-shift"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang tạo...
                </>
              ) : (
                "Tạo ca"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
