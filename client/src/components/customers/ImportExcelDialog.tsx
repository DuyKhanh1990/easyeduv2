import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle2, XCircle, Download, AlertTriangle, FileSpreadsheet, FileDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImportErrorRow, ImportResult, ImportOptions } from "@/hooks/useExcelImportExport";
import { useLanguage } from "@/hooks/use-language";

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
  onImport: (file: File, locationId: string | undefined, options: ImportOptions) => Promise<ImportResult>;
  onDownloadSample: () => void;
  onDownloadErrors: (errorRows: ImportErrorRow[]) => void;
}

export function ImportExcelDialog({
  isOpen,
  onOpenChange,
  locations,
  isImporting,
  uploadProgress,
  onImport,
  onDownloadSample,
  onDownloadErrors,
}: ImportExcelDialogProps) {
  const { t } = useLanguage();
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLocation, setImportLocation] = useState("");
  const [allowDuplicatePhone, setAllowDuplicatePhone] = useState(false);
  const [allowDuplicateEmail, setAllowDuplicateEmail] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleClose = () => {
    setImportFile(null);
    setImportLocation("");
    setResult(null);
    setIsDragging(false);
    onOpenChange(false);
  };

  const handleImport = async () => {
    if (!importFile) return;
    const res = await onImport(importFile, importLocation || undefined, { allowDuplicatePhone, allowDuplicateEmail });
    setResult(res);
  };

  const handleImportAgain = () => {
    setImportFile(null);
    setImportLocation("");
    setResult(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className={cn(
        "rounded-2xl transition-all max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden",
        result ? "sm:max-w-[82vw]" : "sm:max-w-[680px]"
      )}>

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-6 py-4 border-b bg-gradient-to-r from-sky-50 to-blue-50">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-md shadow-sky-200 flex-shrink-0">
            {result ? <FileSpreadsheet className="w-5 h-5 text-white" /> : <Upload className="w-5 h-5 text-white" />}
          </div>
          <div>
            <DialogTitle className="text-base font-bold text-slate-800 leading-none">
              {result ? t("import.titleResult") : t("import.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              {result ? t("import.subtitleResult") : t("import.subtitle")}
            </DialogDescription>
          </div>
        </div>

        {/* ── RESULT VIEW ── */}
        {result ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="relative overflow-hidden flex items-center gap-4 p-5 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl shadow-sm">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-200 flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-emerald-700">{result.successCount}</p>
                    <p className="text-xs text-emerald-600 font-medium mt-0.5">{t("import.successCount")}</p>
                  </div>
                  <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-emerald-100/60" />
                </div>
                <div className="relative overflow-hidden flex items-center gap-4 p-5 bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-200 rounded-2xl shadow-sm">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-md shadow-rose-200 flex-shrink-0">
                    <XCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-rose-700">{result.errorRows.length}</p>
                    <p className="text-xs text-rose-600 font-medium mt-0.5">{t("import.errorCount")}</p>
                  </div>
                  <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-rose-100/60" />
                </div>
              </div>

              {/* Error detail list */}
              {result.errorRows.length > 0 && (
                <div className="rounded-2xl border border-rose-200 overflow-hidden shadow-sm">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-rose-50 to-pink-50 border-b border-rose-200">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-semibold text-rose-700">{t("import.errorDetail")}</span>
                    <span className="ml-auto text-[11px] text-rose-500 bg-rose-100 px-2 py-0.5 rounded-full font-medium">{result.errorRows.length} {t("import.rows")}</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-rose-100/60 bg-white">
                    {result.errorRows.map((e) => (
                      <div key={e.row} className="px-4 py-2.5 hover:bg-rose-50/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">{t("import.row")} {e.row}</span>
                          {e.name && <span className="text-xs text-slate-600 font-medium">{e.name}</span>}
                        </div>
                        <p className="text-xs text-rose-500 mt-1">{e.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.errorRows.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">{t("import.errorInfo")}</p>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-3 px-6 py-4 border-t bg-slate-50/50">
              <div>
                {result.errorRows.length > 0 && (
                  <Button
                    variant="outline"
                    className="border-rose-200 text-rose-600 hover:bg-rose-50 gap-2 rounded-xl h-9 text-xs"
                    onClick={() => onDownloadErrors(result.errorRows)}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t("import.downloadErrors").replace("{{n}}", String(result.errorRows.length))}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {result.errorRows.length > 0 && (
                  <Button variant="outline" onClick={handleImportAgain} className="rounded-xl h-9 text-xs">
                    {t("import.importAgain")}
                  </Button>
                )}
                <Button onClick={handleClose} className="rounded-xl h-9 text-xs bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 border-0 shadow-md shadow-sky-200">
                  {t("import.close")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* ── UPLOAD VIEW ── */
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-5">
                {/* LEFT COLUMN */}
                <div className="space-y-4">
                  {/* Download template */}
                  <button
                    type="button"
                    onClick={onDownloadSample}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-dashed border-sky-300 bg-sky-50/50 hover:bg-sky-50 hover:border-sky-400 transition-colors text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                      <FileDown className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-sky-700">{t("import.template")}</p>
                      <p className="text-[11px] text-sky-500">{t("import.templateSub")}</p>
                    </div>
                  </button>

                  {/* Notice box */}
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      {t("import.notice")}
                    </p>
                    <ul className="space-y-1 text-xs text-amber-700/90 pl-1">
                      <li className="flex items-start gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />{t("import.noticeCol")}</li>
                      <li className="flex items-start gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />{t("import.noticeCode")}</li>
                      <li className="flex items-start gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />{t("import.noticeDropdown")}</li>
                    </ul>
                  </div>

                  {/* Location select */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">{t("import.location")} <span className="text-slate-400 font-normal">{t("import.locationOptional")}</span></Label>
                    <Select value={importLocation} onValueChange={setImportLocation}>
                      <SelectTrigger className="h-9 text-xs bg-white rounded-xl border-slate-200">
                        <SelectValue placeholder={t("import.locationPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {locations?.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id} className="text-xs">{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Duplicate toggles */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 divide-y divide-slate-200">
                    <div className="flex items-center justify-between gap-3 p-3">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{t("import.allowDupePhone")}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{t("import.allowDupePhoneSub")}</p>
                      </div>
                      <Switch checked={allowDuplicatePhone} onCheckedChange={setAllowDuplicatePhone} />
                    </div>
                    <div className="flex items-center justify-between gap-3 p-3">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{t("import.allowDupeEmail")}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{t("import.allowDupeEmailSub")}</p>
                      </div>
                      <Switch checked={allowDuplicateEmail} onCheckedChange={setAllowDuplicateEmail} />
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="flex flex-col gap-4">
                  <div className="space-y-1.5 flex-1">
                    <Label className="text-xs font-medium text-slate-600">
                      {t("import.fileLabel")} <span className="text-rose-500">*</span>
                    </Label>
                    <div
                      className={cn(
                        "border-2 border-dashed rounded-2xl transition-all cursor-pointer relative flex-1 min-h-[160px] flex items-center justify-center",
                        isDragging
                          ? "border-sky-400 bg-sky-50"
                          : importFile
                          ? "border-emerald-300 bg-emerald-50/50"
                          : "border-slate-200 bg-slate-50/50 hover:border-sky-300 hover:bg-sky-50/30"
                      )}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f && f.name.endsWith(".xlsx")) setImportFile(f);
                      }}
                    >
                      <input
                        type="file"
                        accept=".xlsx"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      />
                      <div className="flex flex-col items-center gap-3 px-4 text-center pointer-events-none">
                        {importFile ? (
                          <>
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-200">
                              <FileSpreadsheet className="w-6 h-6 text-white" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-emerald-700 break-all">{importFile.name}</p>
                              <p className="text-[11px] text-emerald-500 mt-0.5">{t("import.fileReady")}</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={cn(
                              "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm transition-all",
                              isDragging
                                ? "bg-gradient-to-br from-sky-500 to-blue-600 shadow-sky-200"
                                : "bg-slate-100"
                            )}>
                              <Upload className={cn("w-6 h-6", isDragging ? "text-white" : "text-slate-400")} />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-600">{t("import.dropzone")}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">{t("import.dropzoneSub")}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {isImporting && (
                    <div className="space-y-2 p-3 bg-sky-50 rounded-xl border border-sky-200">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-sky-700 font-medium flex items-center gap-1.5">
                          <div className="w-3 h-3 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                          {t("import.processing")}
                        </span>
                        <span className="text-sky-600 font-semibold">{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2 bg-sky-100" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t bg-slate-50/50">
              <Button variant="outline" size="sm" onClick={handleClose} disabled={isImporting} className="rounded-xl h-9 text-xs border-slate-200">{t("import.cancel")}</Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={isImporting || !importFile}
                className="rounded-xl h-9 text-xs bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 border-0 shadow-md shadow-sky-200 gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                {isImporting ? t("import.processing") : t("import.start")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
