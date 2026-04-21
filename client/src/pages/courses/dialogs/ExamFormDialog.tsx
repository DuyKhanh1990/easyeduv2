import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Info, Settings, Calendar } from "lucide-react";
import type { Exam } from "@shared/schema";

const examFormSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1, "Tên bài kiểm tra là bắt buộc"),
  status: z.enum(["draft", "published"]).default("draft"),
  description: z.string().optional(),
  timeLimitMinutes: z.coerce.number().min(1).optional().nullable(),
  maxAttempts: z.coerce.number().min(1).default(1),
  passingScore: z.coerce.number().min(0).optional().nullable(),
  showResult: z.boolean().default(false),
  openAt: z.string().optional().nullable(),
  closeAt: z.string().optional().nullable(),
});

type ExamFormValues = z.infer<typeof examFormSchema>;

interface ExamFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: ExamFormValues) => void;
  exam?: Exam | null;
  isSaving?: boolean;
}

function toDatetimeLocal(val: Date | string | null | undefined): string {
  if (!val) return "";
  const d = typeof val === "string" ? new Date(val) : val;
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ExamFormDialog({ open, onClose, onSave, exam, isSaving }: ExamFormDialogProps) {
  const isEditing = !!exam;

  const form = useForm<ExamFormValues>({
    resolver: zodResolver(examFormSchema),
    defaultValues: {
      code: "",
      name: "",
      status: "draft",
      description: "",
      timeLimitMinutes: null,
      maxAttempts: 1,
      passingScore: null,
      showResult: false,
      openAt: null,
      closeAt: null,
    },
  });

  useEffect(() => {
    if (open) {
      if (exam) {
        form.reset({
          code: exam.code ?? "",
          name: exam.name,
          status: (exam.status as "draft" | "published") ?? "draft",
          description: exam.description ?? "",
          timeLimitMinutes: exam.timeLimitMinutes ?? null,
          maxAttempts: exam.maxAttempts ?? 1,
          passingScore: exam.passingScore ? Number(exam.passingScore) : null,
          showResult: exam.showResult ?? false,
          openAt: toDatetimeLocal(exam.openAt),
          closeAt: toDatetimeLocal(exam.closeAt),
        });
      } else {
        form.reset({
          code: "",
          name: "",
          status: "draft",
          description: "",
          timeLimitMinutes: null,
          maxAttempts: 1,
          passingScore: null,
          showResult: false,
          openAt: null,
          closeAt: null,
        });
      }
    }
  }, [open, exam]);

  function handleSubmit(values: ExamFormValues) {
    onSave(values);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Chỉnh sửa bài kiểm tra" : "Tạo bài kiểm tra"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">

            {/* ── Thông tin ── */}
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Info className="w-4 h-4" />
                Thông tin
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mã bài kiểm tra</FormLabel>
                      <FormControl>
                        <Input placeholder="EXAM_001" data-testid="input-exam-code" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tên bài kiểm tra <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Kiểm tra giữa kỳ" data-testid="input-exam-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trạng thái</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex gap-6"
                        data-testid="radio-exam-status"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="draft" id="status-draft" data-testid="radio-status-draft" />
                          <label htmlFor="status-draft" className="text-sm cursor-pointer">Nháp</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="published" id="status-published" data-testid="radio-status-published" />
                          <label htmlFor="status-published" className="text-sm cursor-pointer">Công bố</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mô tả</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Nhập mô tả bài kiểm tra..."
                        className="resize-none"
                        rows={3}
                        data-testid="textarea-exam-description"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Cài đặt ── */}
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-green-600">
                <Settings className="w-4 h-4" />
                Cài đặt
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="timeLimitMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Thời gian làm bài (phút)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="30"
                          data-testid="input-exam-time-limit"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxAttempts"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Số lần làm</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="1"
                          data-testid="input-exam-max-attempts"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 items-end">
                <FormField
                  control={form.control}
                  name="passingScore"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Điểm đạt</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          placeholder="5"
                          data-testid="input-exam-passing-score"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="showResult"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hiển thị kết quả</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2 h-10">
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            id="show-result"
                            data-testid="checkbox-show-result"
                          />
                          <label htmlFor="show-result" className="text-sm cursor-pointer text-muted-foreground">
                            Cho phép học viên xem kết quả sau khi nộp bài
                          </label>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── Thời gian ── */}
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-600">
                <Calendar className="w-4 h-4" />
                Thời gian
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="openAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Thời gian mở</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          data-testid="input-exam-open-at"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="closeAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Thời gian đóng</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          data-testid="input-exam-close-at"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} data-testid="btn-cancel-exam">
                Hủy
              </Button>
              <Button type="submit" disabled={isSaving} data-testid="btn-save-exam">
                {isSaving ? "Đang lưu..." : isEditing ? "Lưu thay đổi" : "Tạo bài kiểm tra"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
