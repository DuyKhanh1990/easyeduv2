import { ClipboardList } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useMySpaceUserType } from "@/hooks/use-my-space-user-type";
import { StudentAssignments } from "./StudentAssignments";
import { StaffAssignments } from "./StaffAssignments";

export default function MyAssignments() {
  const { data, isLoading } = useMySpaceUserType();

  return (
    <DashboardLayout>
      {isLoading && (
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
          <div className="h-8 w-48 rounded-xl bg-secondary/50 animate-pulse" />
          <div className="h-16 rounded-2xl bg-secondary/50 animate-pulse" />
          <div className="h-64 rounded-2xl bg-secondary/50 animate-pulse" />
        </div>
      )}

      {!isLoading && data?.userType === "student" && <StudentAssignments />}
      {!isLoading && data?.userType === "staff" && <StaffAssignments />}

      {!isLoading && !data?.userType && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <ClipboardList className="h-10 w-10 opacity-25" />
            <p className="text-sm">
              {data?.reason === "not_in_daotao"
                ? "Tài khoản không thuộc Phòng Đào tạo nên không có quyền xem trang này"
                : "Tài khoản chưa được liên kết với học viên hoặc nhân viên"}
            </p>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
