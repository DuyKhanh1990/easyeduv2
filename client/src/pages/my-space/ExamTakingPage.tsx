import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, BookOpenCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExamTakingDialog } from "@/pages/courses/dialogs/ExamTakingDialog";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

export function ExamTakingPage() {
  const { id: examId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const classId = searchParams.get("classId") || undefined;

  const { data: authUser, isLoading: authLoading } = useAuth();

  const { data: exams = [], isLoading: examsLoading } = useQuery<any[]>({
    queryKey: ["/api/exams"],
    enabled: !!authUser && !!examId,
  });

  const { data: attemptData, isLoading: attemptLoading } = useQuery<{ count: number; maxAttempts: number | null }>({
    queryKey: ["/api/exams", examId, "my-attempt-count", classId ?? ""],
    queryFn: async () => {
      const url = classId
        ? `/api/exams/${examId}/my-attempt-count?classId=${classId}`
        : `/api/exams/${examId}/my-attempt-count`;
      const res = await fetch(url);
      if (!res.ok) return { count: 0, maxAttempts: null };
      return res.json();
    },
    enabled: !!authUser && !!examId,
  });

  const isLoading = authLoading || examsLoading || attemptLoading;
  const exam = exams.find((e: any) => e.id === examId);

  const maxAttempts = attemptData?.maxAttempts ?? null;
  const attemptCount = attemptData?.count ?? 0;
  const exceeded = maxAttempts !== null && maxAttempts > 0 && attemptCount >= maxAttempts;

  const handleClose = () => {
    navigate("/my-space/assignments");
  };

  if (authLoading || (!!authUser && isLoading)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Đang tải bài kiểm tra...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    navigate(`/login?redirect=/my-space/exam/${examId}${classId ? `?classId=${classId}` : ""}`);
    return null;
  }

  if (!isLoading && !exam) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
            <AlertCircle className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Không tìm thấy bài kiểm tra</h2>
            <p className="text-sm text-muted-foreground mt-1">Bài kiểm tra không tồn tại hoặc bạn không có quyền truy cập.</p>
          </div>
          <Button onClick={handleClose} className="w-full">Quay lại</Button>
        </div>
      </div>
    );
  }

  if (!isLoading && exceeded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
            <BookOpenCheck className="h-7 w-7 text-red-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{exam?.name ?? "Bài kiểm tra"}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Bạn đã làm bài kiểm tra này <strong>{attemptCount}</strong> lần.{" "}
              Số lần làm tối đa là <strong>{maxAttempts}</strong>.
            </p>
          </div>
          <Button onClick={handleClose} className="w-full">Quay lại</Button>
        </div>
      </div>
    );
  }

  if (!exam) return null;

  return (
    <ExamTakingDialog
      exam={exam}
      open={true}
      onClose={handleClose}
      classId={classId}
      onSubmitSuccess={() => {
        queryClient.invalidateQueries({ queryKey: ["/api/exams", examId, "my-attempt-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/my-space/assignments/student"] });
      }}
    />
  );
}
