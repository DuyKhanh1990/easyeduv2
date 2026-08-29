import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, FileText, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { InvoicePrintTemplateRow } from "@shared/schema";
import { InvoicePrintTemplate } from "./InvoicePrintTemplate";
import { TEMPLATE_PRESETS } from "./invoiceTemplatePresets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type TemplateWithCreator = InvoicePrintTemplateRow & { creatorName?: string | null };

const PAGE_SIZE_LABELS: Record<string, string> = {
  A4: "A4 (210 × 297mm)",
  A5: "A5 (148 × 210mm)",
  K80: "K80 – Hoá đơn nhiệt (80mm)",
};

const INVOICE_TYPE_LABELS: Record<string, string> = {
  Thu: "Phiếu thu",
  Chi: "Phiếu chi",
  ThuGop: "Phiếu thu gộp",
  ChiGop: "Phiếu chi gộp",
};

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (template: InvoicePrintTemplateRow) => void;
}

const SCOPE_LABELS: Record<string, string> = {
  general: "Áp dụng chung",
  single: "Áp dụng hoá đơn 1 đợt",
  multi: "Áp dụng hoá đơn nhiều đợt",
};

function CreateTemplateDialog({ open, onOpenChange, onCreated }: CreateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [pageSize, setPageSize] = useState("A4");
  const [invoiceType, setInvoiceType] = useState("Thu");
  const [scope, setScope] = useState("general");
  const [presetKey, setPresetKey] = useState<string>("blank");

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; pageSize: string; invoiceType: string; scope: string; html: string }) => {
      const res = await apiRequest("POST", "/api/finance/invoice-print-templates", data);
      return res.json();
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoice-print-templates"] });
      toast({ title: "Đã tạo mẫu hoá đơn" });
      setName("");
      setPageSize("A4");
      setInvoiceType("Thu");
      setScope("general");
      setPresetKey("blank");
      onOpenChange(false);
      onCreated(template);
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  // Khi đổi preset, tự động đồng bộ loại hoá đơn & khổ giấy gợi ý của preset.
  const handlePresetChange = (key: string) => {
    setPresetKey(key);
    const p = TEMPLATE_PRESETS.find(x => x.key === key);
    if (p && p.key !== "blank") {
      setInvoiceType(p.invoiceType);
      setPageSize(p.pageSize);
      if (!name.trim()) setName(p.label);
    }
  };

  const handleConfirm = () => {
    const preset = TEMPLATE_PRESETS.find(p => p.key === presetKey);
    createMutation.mutate({
      name: name.trim(),
      pageSize,
      invoiceType,
      scope,
      html: preset?.html ?? "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Tạo mẫu hoá đơn mới</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Bắt đầu từ</label>
            <Select value={presetKey} onValueChange={handlePresetChange}>
              <SelectTrigger data-testid="select-template-preset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_PRESETS.map(p => (
                  <SelectItem key={p.key} value={p.key} data-testid={`option-preset-${p.key}`}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {presetKey !== "blank" && (
              <p className="text-[11px] text-muted-foreground">
                Mẫu có sẵn nội dung — bạn có thể chỉnh sửa lại trong trình thiết kế.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Tên hoá đơn</label>
            <Input
              placeholder="Nhập tên mẫu hoá đơn..."
              value={name}
              onChange={e => setName(e.target.value)}
              data-testid="input-template-name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Loại hoá đơn</label>
            <Select value={invoiceType} onValueChange={setInvoiceType}>
              <SelectTrigger data-testid="select-template-invoice-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Thu">Phiếu thu</SelectItem>
                <SelectItem value="Chi">Phiếu chi</SelectItem>
                <SelectItem value="ThuGop">Phiếu thu gộp</SelectItem>
                <SelectItem value="ChiGop">Phiếu chi gộp</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Phạm vi áp dụng</label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger data-testid="select-template-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Áp dụng chung</SelectItem>
                <SelectItem value="single">Áp dụng hoá đơn 1 đợt</SelectItem>
                <SelectItem value="multi">Áp dụng hoá đơn nhiều đợt</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {scope === "general" && "Áp dụng cho tất cả phiếu của loại hoá đơn đã chọn."}
              {scope === "single" && "Hệ thống tự nhận diện các hoá đơn có 1 đợt để áp dụng."}
              {scope === "multi" && "Hệ thống tự nhận diện các hoá đơn có từ 2 đợt trở lên để áp dụng."}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Khổ giấy</label>
            <Select value={pageSize} onValueChange={setPageSize}>
              <SelectTrigger data-testid="select-template-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAGE_SIZE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
            <Button
              disabled={!name.trim() || createMutation.isPending}
              onClick={handleConfirm}
              data-testid="button-create-template-confirm"
            >
              {createMutation.isPending ? "Đang tạo..." : "Tạo mẫu"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function InvoiceTemplateList({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InvoicePrintTemplateRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TemplateWithCreator | null>(null);

  const { data: templates = [], isLoading } = useQuery<TemplateWithCreator[]>({
    queryKey: ["/api/finance/invoice-print-templates"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/finance/invoice-print-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/invoice-print-templates"] });
      toast({ title: "Đã xoá mẫu hoá đơn" });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const closeDesigner = () => {
    setEditingTemplate(null);
    queryClient.invalidateQueries({ queryKey: ["/api/finance/invoice-print-templates"] });
  };

  return (
    <>
      {/* ── Danh sách mẫu ── */}
      <Dialog open={open && !editingTemplate} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex flex-col overflow-hidden"
          style={{ width: "85vw", height: "85vh", maxWidth: "85vw", maxHeight: "85vh" }}
        >
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Mẫu in hoá đơn
              </DialogTitle>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setCreateOpen(true)}
                data-testid="button-add-template"
              >
                <Plus className="h-4 w-4" /> Thêm mẫu
              </Button>
            </div>
          </DialogHeader>

          <div className="mt-2 overflow-auto">
            {isLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Đang tải...</div>
            ) : templates.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Chưa có mẫu hoá đơn nào. Nhấn <b>Thêm mẫu</b> để tạo mới.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tên hoá đơn</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Loại hoá đơn</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Phạm vi áp dụng</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Khổ giấy</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Người tạo</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ngày tạo</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((t, idx) => (
                      <tr
                        key={t.id}
                        className={`border-b last:border-b-0 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                        data-testid={`row-template-${t.id}`}
                      >
                        <td className="px-4 py-3 font-medium" data-testid={`text-template-name-${t.id}`}>
                          <div className="flex items-center gap-1.5">
                            {t.name}
                            {t.isDefault && (
                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" title="Mẫu mặc định" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3" data-testid={`text-template-type-${t.id}`}>
                          <Badge
                            variant="outline"
                            className={t.invoiceType === "Thu"
                              ? "border-green-500 text-green-700 bg-green-50"
                              : "border-red-400 text-red-700 bg-red-50"
                            }
                          >
                            {INVOICE_TYPE_LABELS[t.invoiceType] ?? t.invoiceType}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs" data-testid={`text-template-scope-${t.id}`}>
                          {SCOPE_LABELS[(t as any).scope ?? "general"] ?? "Áp dụng chung"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" data-testid={`text-template-pagesize-${t.id}`}>
                          {PAGE_SIZE_LABELS[t.pageSize] ?? t.pageSize}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" data-testid={`text-template-creator-${t.id}`}>
                          {t.creatorName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" data-testid={`text-template-created-${t.id}`}>
                          {new Date(t.createdAt).toLocaleDateString("vi-VN")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setEditingTemplate(t)}
                              className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors"
                              title="Sửa mẫu"
                              data-testid={`button-edit-template-${t.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(t)}
                              className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors"
                              title="Xoá mẫu"
                              data-testid={`button-delete-template-${t.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Thiết kế mẫu ── */}
      <Dialog
        open={open && !!editingTemplate}
        onOpenChange={(v) => { if (!v) closeDesigner(); }}
      >
        <DialogContent
          className="p-0 flex flex-col overflow-hidden"
          style={{ width: "98vw", height: "98vh", maxWidth: "98vw", maxHeight: "98vh" }}
        >
          {editingTemplate && (
            <InvoicePrintTemplate
              template={editingTemplate}
              onClose={closeDesigner}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Tạo mẫu mới ── */}
      <CreateTemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(template) => setEditingTemplate(template)}
      />

      {/* ── Xoá mẫu ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá mẫu hoá đơn?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xoá mẫu <b>{deleteTarget?.name}</b>? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-template"
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
