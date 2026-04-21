import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { useLocations } from "@/hooks/use-locations";
import { useCreateTeacherSalaryTable, useUpdateTeacherSalaryTable } from "@/hooks/use-teacher-salary";
import type { TeacherSalaryTableWithRelations } from "@/hooks/use-teacher-salary";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  locationId: z.string().uuid("Vui lòng chọn cơ sở"),
  name: z.string().min(1, "Tên bảng lương không được để trống"),
  startDate: z.string().min(1, "Vui lòng chọn ngày bắt đầu"),
  endDate: z.string().min(1, "Vui lòng chọn ngày kết thúc"),
});

type FormValues = z.infer<typeof formSchema>;

interface TeacherSalaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: TeacherSalaryTableWithRelations | null;
  onCreated?: (item: { id: string; name: string; startDate: string; endDate: string; locationName?: string }) => void;
}

function getFreshDefaultValues(): FormValues {
  const now = new Date();
  return {
    locationId: "",
    name: "",
    startDate: format(startOfMonth(now), "yyyy-MM-dd"),
    endDate: format(endOfMonth(now), "yyyy-MM-dd"),
  };
}

export function TeacherSalaryDialog({ open, onOpenChange, editItem, onCreated }: TeacherSalaryDialogProps) {
  const { data: locations } = useLocations();
  const createMutation = useCreateTeacherSalaryTable();
  const updateMutation = useUpdateTeacherSalaryTable();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getFreshDefaultValues(),
  });

  useEffect(() => {
    if (open) {
      if (editItem) {
        form.reset({
          locationId: editItem.locationId,
          name: editItem.name,
          startDate: editItem.startDate,
          endDate: editItem.endDate,
        });
      } else {
        form.reset(getFreshDefaultValues());
      }
    }
  }, [open, editItem]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (editItem) {
        await updateMutation.mutateAsync({ id: editItem.id, data: values });
        toast({ title: "Thành công", description: "Cập nhật bảng lương thành công" });
        onOpenChange(false);
      } else {
        const created = await createMutation.mutateAsync(values);
        const createdData = await created.json();
        toast({ title: "Thành công", description: "Tạo bảng lương thành công" });
        onOpenChange(false);
        const locationName = locations?.find((l) => l.id === values.locationId)?.name;
        onCreated?.({ id: createdData.id, name: values.name, startDate: values.startDate, endDate: values.endDate, locationName });
      }
    } catch (error: any) {
      toast({
        title: "Lỗi",
        description: error.message || "Có lỗi xảy ra",
        variant: "destructive",
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editItem ? "Chỉnh sửa bảng lương" : "Thêm bảng lương mới"}</DialogTitle>
          <DialogDescription>
            {editItem ? "Cập nhật thông tin bảng lương đứng lớp." : "Điền thông tin để tạo bảng lương mới."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cơ sở</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-location">
                        <SelectValue placeholder="Chọn cơ sở" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {locations?.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên bảng lương</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ví dụ: Bảng lương tháng 3/2025"
                      data-testid="input-salary-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ngày bắt đầu</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-start-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ngày kết thúc</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-end-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                data-testid="button-cancel"
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-submit">
                {isPending ? "Đang lưu..." : editItem ? "Cập nhật" : "Tạo"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
