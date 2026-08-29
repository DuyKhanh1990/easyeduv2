import { useState, useEffect, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Checkbox } from "@/components/ui/checkbox";
import { RichEditor } from "@/components/ui/rich-editor";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertCourseProgramContentSchema, type CourseProgram } from "@shared/schema";
import { FileAttachmentInput, type AttachedFile } from "@/components/ui/file-attachment-input";
import { parseAttachment } from "@/lib/file-utils";

interface LibraryContentDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
}

export function LibraryContentDialog({ open: controlledOpen, onOpenChange: controlledOnOpenChange, trigger }: LibraryContentDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(v);
    else setInternalOpen(v);
  };

  const { toast } = useToast();

  const { data: programs = [] } = useQuery<CourseProgram[]>({
    queryKey: ["/api/course-programs"],
    staleTime: 60_000,
  });

  const form = useForm({
    resolver: zodResolver(insertCourseProgramContentSchema),
    defaultValues: {
      title: "",
      type: "Bài học",
      content: "",
      programId: null as string | null,
      sessionNumber: null as number | null,
      attachments: [] as string[],
      createdBy: null as string | null,
      allowDownload: null as boolean | null,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        title: "",
        type: "Bài học",
        content: "",
        programId: null,
        sessionNumber: null,
        attachments: [],
        createdBy: null,
        allowDownload: null,
      });
    }
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = { ...data, programId: data.programId || null, sessionNumber: data.sessionNumber || null };
      const res = await apiRequest("POST", `/api/course-program-contents`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-program-contents"] });
      toast({ title: "Thành công", description: "Đã thêm nội dung vào thư viện" });
      setOpen(false);
    },
    onError: () => toast({ title: "Lỗi", description: "Không thể lưu nội dung", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-[90vw] max-w-[90vw] max-h-[90vh] flex flex-col">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="flex flex-col flex-1 min-h-0">
            <DialogHeader className="shrink-0 flex flex-row items-center justify-between space-y-0 pb-2 border-b">
              <DialogTitle className="text-xl font-display">Thêm nội dung thư viện</DialogTitle>
              <Button type="submit" size="sm" className="ml-4 shrink-0" disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Thêm vào thư viện
              </Button>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loại nội dung *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "Bài học"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn loại" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Bài học">Bài học</SelectItem>
                          <SelectItem value="Bài tập về nhà">Bài tập về nhà</SelectItem>
                          <SelectItem value="Giáo trình">Giáo trình</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="programId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chương trình học</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Chưa gán" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Chưa gán</SelectItem>
                          {programs.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên nội dung *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nhập tên nội dung" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mô tả nội dung</FormLabel>
                    <RichEditor
                      value={field.value || ""}
                      onChange={field.onChange}
                      placeholder="Nhập mô tả chi tiết, hoặc paste ảnh trực tiếp vào đây..."
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="attachments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Đính kèm file</FormLabel>
                    <FileAttachmentInput
                      value={(field.value || [])
                        .map(parseAttachment)
                        .filter((a): a is AttachedFile & { url: string } => !!a.url)}
                      onChange={(files) =>
                        field.onChange(files.map((f) => `${f.name}||${f.url}`))
                      }
                    />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowDownload"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-3 py-1">
                      <Checkbox
                        id="lib-allow-download-cal"
                        checked={field.value === true}
                        onCheckedChange={(checked) => field.onChange(checked === true ? true : (field.value === false ? false : null))}
                        className="w-4 h-4"
                      />
                      <label htmlFor="lib-allow-download-cal" className="text-sm font-medium cursor-pointer select-none">
                        Cho phép tải file đính kèm
                      </label>
                      <span className="text-xs text-muted-foreground">(để trống = theo mặc định vai trò)</span>
                    </div>
                    {field.value !== null && field.value !== undefined && (
                      <button type="button" onClick={() => field.onChange(null)} className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground underline ml-7">
                        Xoá ghi đè, dùng mặc định vai trò
                      </button>
                    )}
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
