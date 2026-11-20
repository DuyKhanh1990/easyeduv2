import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, CircleDot, CheckSquare, PenLine, AlignLeft, GitMerge } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Question } from "@shared/schema";

const TYPE_INFO: Record<string, { label: string; color: string }> = {
  single_choice:   { label: "Trắc nghiệm",     color: "bg-blue-100 text-blue-700" },
  multiple_choice: { label: "Nhiều lựa chọn",  color: "bg-purple-100 text-purple-700" },
  fill_blank:      { label: "Điền chỗ trống",  color: "bg-orange-100 text-orange-700" },
  essay:           { label: "Tự luận",          color: "bg-green-100 text-green-700" },
  matching:        { label: "Câu hỏi nối",      color: "bg-pink-100 text-pink-700" },
};

interface PickFromBankDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (questionIds: string[]) => void;
  alreadyAddedIds?: Set<string>;
  isSaving?: boolean;
}

export function PickFromBankDialog({
  open, onClose, onConfirm, alreadyAddedIds = new Set(), isSaving,
}: PickFromBankDialogProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: questions = [], isLoading } = useQuery<Question[]>({
    queryKey: ["/api/questions"],
    enabled: open,
  });

  const filtered = useMemo(() => {
    return questions.filter(q => {
      const matchSearch = !search ||
        q.content.toLowerCase().includes(search.toLowerCase()) ||
        (q.title ?? "").toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === "all" || q.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [questions, search, typeFilter]);

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const available = filtered.filter(q => !alreadyAddedIds.has(q.id));
    const allSelected = available.every(q => selected.has(q.id));
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        available.forEach(q => next.delete(q.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        available.forEach(q => next.add(q.id));
        return next;
      });
    }
  }

  function handleConfirm() {
    onConfirm(Array.from(selected));
    setSelected(new Set());
    setSearch("");
    setTypeFilter("all");
  }

  function handleClose() {
    setSelected(new Set());
    setSearch("");
    setTypeFilter("all");
    onClose();
  }

  const available = filtered.filter(q => !alreadyAddedIds.has(q.id));
  const allFilteredSelected = available.length > 0 && available.every(q => selected.has(q.id));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Chọn câu hỏi từ ngân hàng</DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="px-6 py-3 border-b shrink-0 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm câu hỏi..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
              data-testid="input-search-questions"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["all", "single_choice", "multiple_choice", "fill_blank", "essay", "matching"].map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs border transition-all",
                  typeFilter === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                )}
              >
                {t === "all" ? "Tất cả" : TYPE_INFO[t]?.label}
              </button>
            ))}
          </div>
        </div>

        {/* Question list */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Đang tải...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Không tìm thấy câu hỏi nào</p>
          ) : (
            <div className="space-y-1.5">
              {/* Select all row */}
              <div
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer border border-transparent"
                onClick={toggleAll}
              >
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={toggleAll}
                  data-testid="checkbox-select-all"
                  onClick={e => e.stopPropagation()}
                />
                <span className="text-xs text-muted-foreground font-medium">
                  Chọn tất cả ({available.length} câu hỏi)
                </span>
              </div>

              {filtered.map((q, idx) => {
                const isAdded = alreadyAddedIds.has(q.id);
                const isChecked = selected.has(q.id);
                const typeInfo = TYPE_INFO[q.type];

                return (
                  <div
                    key={q.id}
                    onClick={() => !isAdded && toggleOne(q.id)}
                    data-testid={`row-bank-question-${idx}`}
                    className={cn(
                      "flex items-start gap-3 px-3 py-2.5 rounded-md border transition-all",
                      isAdded
                        ? "bg-muted/30 border-border opacity-60 cursor-not-allowed"
                        : isChecked
                        ? "bg-primary/5 border-primary/30 cursor-pointer"
                        : "bg-background border-transparent hover:bg-muted/40 hover:border-border cursor-pointer"
                    )}
                  >
                    <Checkbox
                      checked={isChecked}
                      disabled={isAdded}
                      onCheckedChange={() => !isAdded && toggleOne(q.id)}
                      onClick={e => e.stopPropagation()}
                      className="mt-0.5 shrink-0"
                      data-testid={`checkbox-question-${idx}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        {q.title && (
                          <span className="text-xs font-medium text-foreground">{q.title}</span>
                        )}
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", typeInfo?.color ?? "bg-gray-100 text-gray-600")}>
                          {typeInfo?.label ?? q.type}
                        </span>
                        {isAdded && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">Đã thêm</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{q.content}</p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0 font-medium">{q.score}đ</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <span className="text-xs text-muted-foreground mr-auto">
            {selected.size > 0 ? `Đã chọn ${selected.size} câu hỏi` : "Chưa chọn câu hỏi nào"}
          </span>
          <Button variant="outline" size="sm" onClick={handleClose} data-testid="btn-cancel-pick">
            Hủy
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={selected.size === 0 || isSaving}
            data-testid="btn-confirm-pick"
          >
            {isSaving ? "Đang thêm..." : `Thêm ${selected.size > 0 ? `(${selected.size})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
