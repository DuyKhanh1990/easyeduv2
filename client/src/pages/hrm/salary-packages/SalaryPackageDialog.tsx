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
  useSalaryPackageRoles,
  getUnitPriceLabel,
  isRangeBasedType,
} from "@/hooks/use-teacher-salary-packages";
import type { TeacherSalaryPackage, SalaryRange } from "@/hooks/use-teacher-salary-packages";

const formSchema = z.object({
  name: z.string().min(1, "Tên gói không được để trống"),
  type: z.string().min(1, "Vui lòng chọn loại gói"),
});

type FormValues = z.infer<typeof formSchema>;
type RoleRateDraft = { role: string; unitPrice: string; ranges: SalaryRange[] };

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
  const { data: trainingRoles = [] } = useSalaryPackageRoles();

  const [roleRates, setRoleRates] = useState<RoleRateDraft[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "theo-gio",
    },
  });

  const selectedType = form.watch("type");

  useEffect(() => {
    if (open) {
      if (editItem) {
        form.reset({
          name: editItem.name,
          type: editItem.type,
        });
        const savedRates = Array.isArray(editItem.roleRates) ? editItem.roleRates : [];
        setRoleRates(savedRates.length > 0
          ? savedRates.map((rate) => ({
              role: rate.role,
              unitPrice: rate.unitPrice ? String(rate.unitPrice) : "",
              ranges: Array.isArray(rate.ranges) ? rate.ranges as SalaryRange[] : [],
            }))
          : [{
              role: editItem.role,
              unitPrice: editItem.unitPrice ? String(editItem.unitPrice) : "",
              ranges: Array.isArray(editItem.ranges) ? editItem.ranges as SalaryRange[] : [],
            }]);
      } else {
        form.reset({
          name: "",
          type: "theo-gio",
        });
        setRoleRates([]);
      }
    }
  }, [open, editItem]);

  useEffect(() => {
    if (!open || editItem || trainingRoles.length === 0) return;
    setRoleRates((prev) => prev.length > 0
      ? prev
      : [{ role: trainingRoles[0].name, unitPrice: "", ranges: [] }]);
  }, [open, editItem, trainingRoles]);

  useEffect(() => {
    if (!isRangeBasedType(selectedType)) {
      setRoleRates((prev) => prev.map((rate) => ({ ...rate, ranges: [] })));
    }
  }, [selectedType]);

  const handleAddRoleRate = () => {
    setRoleRates((prev) => [...prev, { role: "", unitPrice: "", ranges: [] }]);
  };

  const handleRemoveRoleRate = (index: number) => {
    setRoleRates((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddRange = (roleIndex: number) => {
    setRoleRates((prev) => prev.map((rate, index) => {
      if (index !== roleIndex) return rate;
      const current = rate.ranges;
      if (current.length === 0) {
        return {
          ...rate,
          ranges: selectedType === "theo-so-hv"
            ? [{ from: 1, to: 10, price: 0 }]
            : [{ from: 0, to: 9, price: 0 }],
        };
      }
      const last = current[current.length - 1];
      return {
        ...rate,
        ranges: [...current, { from: last.to + 1, to: last.to + 10, price: 0 }],
      };
    }));
  };

  const handleRemoveRange = (roleIndex: number, rangeIndex: number) => {
    setRoleRates((prev) => prev.map((rate, index) => index === roleIndex
      ? { ...rate, ranges: rate.ranges.filter((_, i) => i !== rangeIndex) }
      : rate));
  };

  const handleRangeChange = (
    roleIndex: number,
    rangeIndex: number,
    field: keyof SalaryRange,
    value: string,
  ) => {
    setRoleRates((prev) => prev.map((rate, index) => index === roleIndex
      ? {
          ...rate,
          ranges: rate.ranges.map((range, i) => i === rangeIndex
            ? { ...range, [field]: value === "" ? 0 : Number(value) }
            : range),
        }
      : rate));
  };

  const onSubmit = async (values: FormValues) => {
    if (roleRates.length === 0 || roleRates.some((rate) => !rate.role)) {
      toast({ title: "Thiếu vai trò", description: "Hãy chọn vai trò cho từng dòng.", variant: "destructive" });
      return;
    }
    const selectedRoles = roleRates.map((rate) => rate.role);
    if (new Set(selectedRoles).size !== selectedRoles.length) {
      toast({ title: "Vai trò bị trùng", description: "Mỗi vai trò chỉ được chọn một lần trong gói.", variant: "destructive" });
      return;
    }
    const savedRates = roleRates.map((rate) => ({
      role: rate.role,
      unitPrice: isRangeBasedType(values.type) ? null : rate.unitPrice || null,
      ranges: isRangeBasedType(values.type) ? rate.ranges : null,
    }));
    const firstRate = savedRates[0];
    const payload: Record<string, unknown> = {
      name: values.name,
      type: values.type,
      roleRates: savedRates,
      role: firstRate.role,
      unitPrice: firstRate.unitPrice,
      ranges: firstRate.ranges,
    };

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
  const sectionLabel = getSectionLabel(selectedType);
  const addButtonLabel = getAddButtonLabel(selectedType);
  const milestoneNote = getMilestoneNote(selectedType);
  const isRangeBased = isRangeBasedType(selectedType);
  const unit = getRangeUnit(selectedType);

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
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Vai trò và mức lương</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddRoleRate}
                  data-testid="button-add-package-role"
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Thêm vai trò
                </Button>
              </div>
              {roleRates.map((rate, roleIndex) => (
                <div key={roleIndex} className="space-y-3 rounded-md border p-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-2">
                      <label className="text-sm font-medium">
                        Vai trò <span className="text-destructive">*</span>
                      </label>
                      <Select
                        value={rate.role || undefined}
                        onValueChange={(value) => setRoleRates((prev) => prev.map((item, index) =>
                          index === roleIndex ? { ...item, role: value } : item
                        ))}
                      >
                        <SelectTrigger data-testid={`select-package-role-${roleIndex}`}>
                          <SelectValue placeholder="Chọn vai trò" />
                        </SelectTrigger>
                        <SelectContent>
                          {trainingRoles.map((role) => (
                            <SelectItem
                              key={role.id}
                              value={role.name}
                              disabled={roleRates.some((item, index) => index !== roleIndex && item.role === role.name)}
                            >
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveRoleRate(roleIndex)}
                      aria-label="Xóa vai trò khỏi gói"
                      data-testid={`button-remove-package-role-${roleIndex}`}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {!isRangeBased && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{getUnitPriceLabel(selectedType)}</label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Nhập giá trị"
                        value={rate.unitPrice}
                        onChange={(event) => setRoleRates((prev) => prev.map((item, index) =>
                          index === roleIndex ? { ...item, unitPrice: event.target.value } : item
                        ))}
                        data-testid={`input-unit-price-${roleIndex}`}
                      />
                    </div>
                  )}

                  {isRangeBased && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">{sectionLabel}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddRange(roleIndex)}
                          data-testid={`button-add-range-${roleIndex}`}
                          className="h-7 gap-1"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {addButtonLabel}
                        </Button>
                      </div>
                      {milestoneNote && <p className="text-xs text-blue-600">{milestoneNote}</p>}
                      {rate.ranges.map((range, rangeIndex) => (
                        <div key={rangeIndex} className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">{selectedType === "theo-so-hv" ? "" : "Từ"}</span>
                          <Input
                            type="number"
                            value={range.from}
                            onChange={(event) => handleRangeChange(roleIndex, rangeIndex, "from", event.target.value)}
                            className="w-16 px-1 text-center"
                            min={0}
                            data-testid={`input-range-from-${roleIndex}-${rangeIndex}`}
                          />
                          <span className="text-xs text-muted-foreground">đến</span>
                          <Input
                            type="number"
                            value={range.to}
                            onChange={(event) => handleRangeChange(roleIndex, rangeIndex, "to", event.target.value)}
                            className="w-16 px-1 text-center"
                            min={0}
                            data-testid={`input-range-to-${roleIndex}-${rangeIndex}`}
                          />
                          <span className="text-xs text-muted-foreground">{unit}</span>
                          <Input
                            type="number"
                            value={range.price}
                            onChange={(event) => handleRangeChange(roleIndex, rangeIndex, "price", event.target.value)}
                            className="min-w-0 flex-1"
                            min={0}
                            data-testid={`input-range-price-${roleIndex}-${rangeIndex}`}
                          />
                          <span className="text-xs text-muted-foreground">đ</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveRange(roleIndex, rangeIndex)}
                            aria-label="Xóa mốc lương"
                            data-testid={`button-remove-range-${roleIndex}-${rangeIndex}`}
                            className="h-7 w-7 shrink-0 text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/*
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
            */}

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
