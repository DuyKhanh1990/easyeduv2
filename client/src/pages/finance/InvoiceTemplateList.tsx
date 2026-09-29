import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, FileText, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest } from "@/lib/queryClient";
import type { InvoicePrintTemplateRow } from "@shared/schema";
import { fmtDate as formatInvoiceDate } from "@/types/invoice-types";
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

const PAGE_SIZE_KEYS: Record<string, string> = {
  A4: "finance.paperA4",
  A5: "finance.paperA5",
  K80: "finance.paperK80",
};

const INVOICE_TYPE_KEYS: Record<string, string> = {
  Thu: "finance.templateReceipt",
  Chi: "finance.templateExpense",
  ThuGop: "finance.templateBulkReceipt",
  ChiGop: "finance.templateBulkExpense",
};

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (template: InvoicePrintTemplateRow) => void;
}

const SCOPE_KEYS: Record<string, string> = {
  general: "finance.templateScopeGeneral",
  single: "finance.templateScopeSingle",
  multi: "finance.templateScopeMulti",
};

function CreateTemplateDialog({ open, onOpenChange, onCreated }: CreateDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
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
      toast({ title: t("finance.templateCreated") });
      setName("");
      setPageSize("A4");
      setInvoiceType("Thu");
      setScope("general");
      setPresetKey("blank");
      onOpenChange(false);
      onCreated(template);
    },
    onError: (err: any) => {
      toast({ title: t("finance.error"), description: err.message, variant: "destructive" });
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
          <DialogTitle>{t("finance.templateCreateTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("finance.templateStartFrom")}</label>
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
                {t("finance.templatePresetHint")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("finance.templateName")}</label>
            <Input
              placeholder={t("finance.templateNamePlaceholder")}
              value={name}
              onChange={e => setName(e.target.value)}
              data-testid="input-template-name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("finance.templateType")}</label>
            <Select value={invoiceType} onValueChange={setInvoiceType}>
              <SelectTrigger data-testid="select-template-invoice-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Thu">{t("finance.templateReceipt")}</SelectItem>
                <SelectItem value="Chi">{t("finance.templateExpense")}</SelectItem>
                <SelectItem value="ThuGop">{t("finance.templateBulkReceipt")}</SelectItem>
                <SelectItem value="ChiGop">{t("finance.templateBulkExpense")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("finance.templateScope")}</label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger data-testid="select-template-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">{t("finance.templateScopeGeneral")}</SelectItem>
                <SelectItem value="single">{t("finance.templateScopeSingle")}</SelectItem>
                <SelectItem value="multi">{t("finance.templateScopeMulti")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {scope === "general" && t("finance.templateScopeGeneralDesc")}
              {scope === "single" && t("finance.templateScopeSingleDesc")}
              {scope === "multi" && t("finance.templateScopeMultiDesc")}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("finance.templatePaperSize")}</label>
            <Select value={pageSize} onValueChange={setPageSize}>
              <SelectTrigger data-testid="select-template-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAGE_SIZE_KEYS).map(([key, labelKey]) => (
                  <SelectItem key={key} value={key}>{t(labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("finance.cancel")}</Button>
            <Button
              disabled={!name.trim() || createMutation.isPending}
              onClick={handleConfirm}
              data-testid="button-create-template-confirm"
            >
              {createMutation.isPending ? t("finance.templateCreating") : t("finance.templateCreate")}
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
  const { t } = useLanguage();
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
      toast({ title: t("finance.templateDeleted") });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({ title: t("finance.error"), description: err.message, variant: "destructive" });
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
                {t("finance.printTemplates")}
              </DialogTitle>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setCreateOpen(true)}
                data-testid="button-add-template"
              >
                <Plus className="h-4 w-4" /> {t("finance.templateAdd")}
              </Button>
            </div>
          </DialogHeader>

          <div className="mt-2 overflow-auto">
            {isLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">{t("finance.loadingData")}</div>
            ) : templates.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {t("finance.templateNoData")}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("finance.templateNameColumn")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("finance.templateTypeColumn")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("finance.templateScopeColumn")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("finance.templatePaperColumn")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("finance.templateCreatorColumn")}</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("finance.templateCreatedColumn")}</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t("finance.templateActionsColumn")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((template, idx) => (
                      <tr
                        key={template.id}
                        className={`border-b last:border-b-0 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                        data-testid={`row-template-${template.id}`}
                      >
                        <td className="px-4 py-3 font-medium" data-testid={`text-template-name-${template.id}`}>
                          <div className="flex items-center gap-1.5">
                            {template.name}
                            {template.isDefault && (
                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" title={t("finance.templateDefault")} />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3" data-testid={`text-template-type-${template.id}`}>
                          <Badge
                            variant="outline"
                            className={template.invoiceType === "Thu"
                              ? "border-green-500 text-green-700 bg-green-50"
                              : "border-red-400 text-red-700 bg-red-50"
                            }
                          >
                            {INVOICE_TYPE_KEYS[template.invoiceType] ? t(INVOICE_TYPE_KEYS[template.invoiceType]) : template.invoiceType}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs" data-testid={`text-template-scope-${template.id}`}>
                          {SCOPE_KEYS[(template as any).scope ?? "general"] ? t(SCOPE_KEYS[(template as any).scope ?? "general"]) : t("finance.templateScopeGeneral")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" data-testid={`text-template-pagesize-${template.id}`}>
                          {PAGE_SIZE_KEYS[template.pageSize] ? t(PAGE_SIZE_KEYS[template.pageSize]) : template.pageSize}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" data-testid={`text-template-creator-${template.id}`}>
                          {template.creatorName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" data-testid={`text-template-created-${template.id}`}>
                          {formatInvoiceDate(template.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setEditingTemplate(template)}
                              className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors"
                              title={t("finance.templateEdit")}
                              data-testid={`button-edit-template-${template.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(template)}
                              className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors"
                              title={t("finance.templateDelete")}
                              data-testid={`button-delete-template-${template.id}`}
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
            <AlertDialogTitle>{t("finance.templateDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("finance.templateDeleteConfirm", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("finance.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-template"
            >
              {t("finance.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
