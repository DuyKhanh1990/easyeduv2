import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StudentDetailDialog } from "./StudentDetailDialog";
import { useStudent } from "@/hooks/use-students";
import { useLanguage } from "@/hooks/use-language";

export function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const studentId = params.id ?? "";
  const { t } = useLanguage();

  const { data: student, isLoading } = useStudent(studentId);

  const { data: starBalance = 0 } = useQuery<number>({
    queryKey: ["/api/students/star-balances", studentId],
    queryFn: async () => {
      const res = await fetch(`/api/students/star-balances?ids=${studentId}`, { credentials: "include" });
      if (!res.ok) return 0;
      const map: Record<string, number> = await res.json();
      return map[studentId] ?? 0;
    },
    enabled: !!studentId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Prefetch tasks dùng cùng queryKey với StudentOverviewTab
  // → khi OverviewTab mount, TanStack Query thấy cache sẵn, không fetch lại
  useQuery<Record<string, any[]>>({
    queryKey: ["/api/tasks/by-subjects", studentId],
    queryFn: () =>
      fetch(`/api/tasks/by-subjects?ids=${studentId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!studentId,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  const handleClose = (open: boolean) => {
    if (!open) navigate("/customers");
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!student) {
    return (
      <DashboardLayout>
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <p>{t("studentDetail.notFound")}</p>
          <button
            className="text-sm text-primary underline"
            onClick={() => navigate("/customers")}
          >
            {t("studentDetail.backToList")}
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <StudentDetailDialog
        open={true}
        onOpenChange={handleClose}
        student={student}
        starBalance={starBalance}
        prefetchedTasks={undefined}
      />
    </DashboardLayout>
  );
}
