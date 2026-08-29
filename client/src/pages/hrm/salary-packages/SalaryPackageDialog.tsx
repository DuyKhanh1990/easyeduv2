import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus } from "lucide-react";
import {
  useCreateTeacherSalaryPackage,
  useUpdateTeacherSalaryPackage,
  PACKAGE_TYPES,
  PACKAGE_ROLES,
  getUnitPriceLabel,
  isRangeBasedType,
} from "@/hooks/use-teacher-salary-packages";
import type { TeacherSalaryPackage, SalaryRange } from "@/hooks/use-teacher-salary-packages";

const formSchema = z.object({
  name: z.string().min(1, "Tên gói không được để trống"),
  type: z.string().min(1, "Vui lòng chọn loại gói"),
  role: z.string().min(1, "Vui lòng chọn vai trò"),
  unitPrice: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: TeacherSalaryPackage | null;
}

function getRangeUnit(type: string): string {
  if (type === "tong-so-gio") return "h";
  if (type === "tong-so-buoi") return "buổi";
  return "HV";
}

function getSectionLabel(type: string): string {
  if (type === "theo-so-hv") return "Khoảng giá theo số HV";
  if (type === "tong-so-gio") return "Mốc lương theo tổng số giờ";
  if (type === "tong-so-buoi") return "Mốc lương theo tổng số buổi";
  return "";
}

function getAddButtonLabel(type: string): string {
  if (type === "theo-so-hv") return "Thêm khoảng";
  return "Thêm mốc";
}

function getMilestoneNote(type: string): string {
  if (type === "tong-so-gio")
    return "GV phải đạt đủ số giờ trong tháng mới được tính lương theo mốc tương ứng";
  if (type === "tong-so-buoi")
    return "GV phải đạt đủ số buổi dạy trong tháng mới được tính lương theo mốc tương ứng";
  return "";
}

export function SalaryPackageDialog({ open, onOpenChange, editItem }: Props) {
  const { toast } = useToast();
  const createMutation = useCreateTeacherSalaryPackage();
  const updateMutation = useUpdateTeacherSalaryPackage();

  const [ranges, setRanges] = useState<SalaryRange[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "theo-gio",
      role: "Giáo viên",
      unitPrice: "",
    },
  });

  const selectedType = form.watch("type");

  useEffect(() => {
    if (open) {
      if (editItem) {
        form.reset({
          name: editItem.name,
          type: editItem.type,
          role: editItem.role,
          unitPrice: editItem.unitPrice ? String(editItem.unitPrice) : "",
        });
        const editRanges = editItem.ranges as SalaryRange[] | null;
        setRanges(editRanges && Array.isArray(editRanges) ? editRanges : []);
      } else {
        form.reset({
          name: "",
          type: "theo-gio",
          role: "Giáo viên",
          unitPrice: "",
        });
        setRanges([]);
      }
    }
  }, [open, editItem]);

  useEffect(() => {
    if (!isRangeBasedType(selectedType)) {
      setRanges([]);
    }
  }, [selectedType]);

  const handleAddRange = () => {
    setRanges((prev) => {
      if (prev.length === 0) {
        if (selectedType === "theo-so-hv") {
          return [{ from: 1, to: 10, price: 0 }];
        }
        return [{ from: 0, to: 10, price: 0 }];
      }
      const last = prev[prev.length - 1];
      const newFrom = last.to + 1;
      const increment = selectedType === "theo-so-hv" ? 10 : 10;
      return [...prev, { from: newFrom, to: newFrom + increment - 1, price: 0 }];
    });
  };

  const handleRemoveRange = (index: number) => {
    setRanges((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRangeChange = (index: number, field: keyof SalaryRange, value: string) => {
    setRanges((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, [field]: value === "" ? 0 : Number(value) } : r
      )
    );
  };

  const onSubmit = async (values: FormValues) => {
    const payload: Record<string, unknown> = {
      name: values.name,
      type: values.type,
      role: values.role,
    };

    if (isRangeBasedType(values.type)) {
      payload.ranges = ranges;
      payload.unitPrice = null;
    } else {
      payload.unitPrice = values.unitPrice ? values.unitPrice : null;
      payload.ranges = null;
    }

    try {
      if (editItem) {
        await updateMutation.mutateAsync({ id: editItem.id, data: payload as any });
        toast({ title: "Thành công", description: "Cập nhật gói lương thành công" });
      } else {
        await createMutation.mutateAsync(payload as any);
        toast({ title: "Thành công", description: "Thêm gói lương thành công" });
      }
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Lỗi",
        description: error.message || "Có lỗi xảy ra",
        variant: "destructive",
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const unit = getRangeUnit(selectedType);
  const sectionLabel = getSectionLabel(selectedType);
  const addButtonLabel = getAddButtonLabel(selectedType);
  const milestoneNote = getMilestoneNote(selectedType);
  const isRangeBased = isRangeBasedType(selectedType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editItem ? "Chỉnh sửa gói lương" : "Thêm gói lương"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Tên gói <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nhập tên gói lương"
                      {...field}
                      data-testid="input-package-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Loại gói <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-package-type">
                          <SelectValue placeholder="Chọn loại gói" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PACKAGE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Vai trò <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-package-role">
                          <SelectValue placeholder="Chọn vai trò" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PACKAGE_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {!isRangeBased && (
              <FormField
                control={form.control}
                name="unitPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{getUnitPriceLabel(selectedType)}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Nhập giá trị"
                        {...field}
                        data-testid="input-unit-price"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {isRangeBased && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{sectionLabel}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddRange}
                    data-testid="button-add-range"
                    className="flex items-center gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    {addButtonLabel}
                  </Button>
                </div>

                {milestoneNote && (
                  <p className="text-xs text-blue-600">{milestoneNote}</p>
                )}

                <div className="space-y-2">
                  {selectedType === "theo-so-hv"
                    ? ranges.map((range, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={range.from}
                            onChange={(e) => handleRangeChange(index, "from", e.target.value)}
                            className="w-20 text-center"
                            min={0}
                            data-testid={`input-range-from-${index}`}
                          />
                          <span className="text-sm text-muted-foreground">-</span>
                          <Input
                            type="number"
                            value={range.to}
                            onChange={(e) => handleRangeChange(index, "to", e.target.value)}
                            className="w-20 text-center"
                            min={0}
                            data-testid={`input-range-to-${index}`}
                          />
                          <span className="text-sm text-muted-foreground whitespace-nowrap">{unit}:</span>
                          <Input
                            type="number"
                            value={range.price}
                            onChange={(e) => handleRangeChange(index, "price", e.target.value)}
                            className="flex-1"
                            min={0}
                            data-testid={`input-range-price-${index}`}
                          />
                          <span className="text-sm text-muted-foreground">đ</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRange(index)}
                            className="text-destructive hover:text-destructive/80 p-1"
                            data-testid={`button-remove-range-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    : ranges.map((range, index) => (
                        <div key={index} className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-muted-foreground whitespace-nowrap">Từ</span>
                          <Input
                            type="number"
                            value={range.from}
                            onChange={(e) => handleRangeChange(index, "from", e.target.value)}
                            className="w-20 text-center"
                            min={0}
                            data-testid={`input-range-from-${index}`}
                          />
                          <span className="text-sm text-muted-foreground whitespace-nowrap">đến</span>
                          <Input
                            type="number"
                            value={range.to}
                            onChange={(e) => handleRangeChange(index, "to", e.target.value)}
                            className="w-20 text-center"
                            min={0}
                            data-testid={`input-range-to-${index}`}
                          />
                          <span className="text-sm text-muted-foreground whitespace-nowrap">{unit}:</span>
                          <Input
                            type="number"
                            value={range.price}
                            onChange={(e) => handleRangeChange(index, "price", e.target.value)}
                            className="flex-1 min-w-[100px]"
                            min={0}
                            data-testid={`input-range-price-${index}`}
                          />
                          <span className="text-sm text-muted-foreground">đ</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRange(index)}
                            className="text-destructive hover:text-destructive/80 p-1"
                            data-testid={`button-remove-range-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-package"
              >
                Hủy
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-package">
                {isPending ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
