import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { toLocalDateString } from "@/lib/center-time-format";

interface SplitClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  classSessionId: string | null;
  classData: any;
  onCreated: (newClassId: string) => void;
}

export function SplitClassDialog({
  open,
  onOpenChange,
  classId,
  classSessionId,
  classData,
  onCreated,
}: SplitClassDialogProps) {
  const [classCode, setClassCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: sessions = [] } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/sessions`],
    enabled: open && !!classId,
  });

  useEffect(() => {
    if (!open) return;
    setClassCode(`COPY-${String(classData?.classCode ?? "").slice(0, 35)}`);
    setName(`${classData?.name ?? ""} - Tách`);
  }, [open, classData?.classCode, classData?.name]);

  const selectedSession = sessions.find((session) => session.id === classSessionId);
  const splitSessions = [...sessions]
    .filter((session) => (session.sessionIndex ?? 0) >= (selectedSession?.sessionIndex ?? Number.MAX_SAFE_INTEGER))
    .sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0));

  const submit = async () => {
    if (!classSessionId) return;
    setSaving(true);
    try {
      const response = await apiRequest("POST", `/api/classes/${classId}/split-from-session`, {
        classSessionId,
        classCode: classCode.trim(),
        name: name.trim(),
      });
      const result = await response.json();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/active-students`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/classes"] }),
      ]);
      onOpenChange(false);
      toast({
        title: "Tách lớp thành công",
        description: `Đã chuyển ${result.movedSessions} buổi sang lớp ${result.class?.classCode}.`,
      });
      onCreated(result.class.id);
    } catch (error: any) {
      toast({
        title: "Không thể tách lớp",
        description: error.message || "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tách lớp từ buổi {selectedSession?.sessionIndex}</DialogTitle>
          <DialogDescription>
            Các buổi từ buổi được chọn đến cuối lịch sẽ được chuyển nguyên sang lớp mới. Không thể tách buổi đã diễn ra.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Mã lớp mới</label>
            <Input value={classCode} onChange={(event) => setClassCode(event.target.value)} maxLength={50} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tên lớp mới</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={255} />
          </div>
          <div className="max-h-48 overflow-y-auto rounded-md border p-3 text-sm">
            <div className="mb-2 font-medium">Buổi sẽ chuyển ({splitSessions.length})</div>
            {splitSessions.map((session) => (
              <div key={session.id} className="flex justify-between border-t py-1.5 text-muted-foreground">
                <span>Buổi {session.sessionIndex}</span>
                <span>
                  {toLocalDateString(session.sessionDate)}
                  {session.shiftTemplate?.startTime && ` · ${String(session.shiftTemplate.startTime).slice(0, 5)}`}
                  {session.shiftTemplate?.endTime && `–${String(session.shiftTemplate.endTime).slice(0, 5)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Hủy</Button>
          <Button onClick={submit} disabled={saving || !classCode.trim() || !name.trim() || !classSessionId}>
            {saving ? "Đang tách..." : "Tách lớp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
