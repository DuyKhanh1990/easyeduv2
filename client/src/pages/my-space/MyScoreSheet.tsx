import { BarChart3 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useMySpaceUserType } from "@/hooks/use-my-space-user-type";
import { StudentScoreSheet } from "./StudentScoreSheet";
import { StaffScoreSheet } from "./StaffScoreSheet";

export default function MyScoreSheet() {
  const { data, isLoading } = useMySpaceUserType();

  return (
    <DashboardLayout>
      {isLoading && (
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
          <div className="h-8 w-48 rounded-xl bg-secondary/50 animate-pulse" />
          <div className="h-16 rounded-2xl bg-secondary/50 animate-pulse" />
          <div className="h-64 rounded-2xl bg-secondary/50 animate-pulse" />
        </div>
      )}

      {!isLoading && data?.userType === "student" && <StudentScoreSheet />}
      {!isLoading && data?.userType === "staff" && <StaffScoreSheet />}

      {!isLoading && !data?.userType && (
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <BarChart3 className="h-10 w-10 opacity-25" />
            <p className="text-sm">Tài khoản chưa được liên kết với học viên hoặc nhân viên</p>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
