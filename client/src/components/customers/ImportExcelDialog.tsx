import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Upload } from "lucide-react";

interface Location {
  id: string;
  name: string;
}

interface ImportExcelDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  locations: Location[] | undefined;
  isImporting: boolean;
  uploadProgress: number;
  onImport: (file: File, locationId: string, onSuccess: () => void) => Promise<void>;
  onDownloadSample: () => void;
}

export function ImportExcelDialog({
  isOpen,
  onOpenChange,
  locations,
  isImporting,
  uploadProgress,
  onImport,
  onDownloadSample,
}: ImportExcelDialogProps) {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLocation, setImportLocation] = useState("");

  const handleImport = () => {
    if (!importFile || !importLocation) return;
    onImport(importFile, importLocation, () => {
      setImportFile(null);
      setImportLocation("");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display font-bold">Nhập danh sách học viên</DialogTitle>
          <DialogDescription>
            Tải lên file Excel (.xlsx) chứa danh sách học viên để nhập nhanh vào hệ thống.
          </DialogDescription>
          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm space-y-2">
            <p className="font-bold text-amber-900 dark:text-amber-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Lưu ý định dạng file:
            </p>
            <ul className="grid grid-cols-1 gap-y-1 text-amber-800/80 dark:text-amber-500 list-inside list-disc">
              <li>Cột <span className="text-amber-900 dark:text-amber-300 font-medium">B, D, N</span> là bắt buộc (Bôi vàng trong file mẫu)</li>
              <li>Mã số trống → Tự động (HV-01...)</li>
              <li>Sử dụng dropdown có sẵn trong file Excel</li>
              <li>
                <button type="button" onClick={onDownloadSample} className="text-primary underline font-medium cursor-pointer">
                  Tải file mẫu Excel tại đây
                </button>
              </li>
            </ul>
          </div>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Chọn cơ sở <span className="text-destructive">*</span></Label>
            <Select value={importLocation} onValueChange={setImportLocation}>
              <SelectTrigger className="h-11 bg-white">
                <SelectValue placeholder="Chọn cơ sở" />
              </SelectTrigger>
              <SelectContent>
                {locations?.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Chọn file (.xlsx) <span className="text-destructive">*</span></Label>
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer relative">
              <input
                type="file"
                accept=".xlsx"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                {importFile ? (
                  <p className="text-sm font-medium text-primary">{importFile.name}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Nhấn để chọn hoặc kéo thả file vào đây</p>
                )}
              </div>
            </div>
          </div>

          {isImporting && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Đang xử lý...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>Huỷ</Button>
          <Button onClick={handleImport} disabled={isImporting || !importFile || !importLocation}>
            {isImporting ? "Đang xử lý..." : "Bắt đầu tải lên"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
