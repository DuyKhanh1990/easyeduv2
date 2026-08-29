import { CalendarDays } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useMySpaceUserType } from "@/hooks/use-my-space-user-type";
import { StudentCalendar } from "./StudentCalendar";
import { StaffCalendar } from "./StaffCalendar";
import { useLanguage } from "@/hooks/use-language";

export default function MyCalendar() {
  const { data, isLoading } = useMySpaceUserType();
  const { t } = useLanguage();

  return (
    <DashboardLayout>
      {isLoading && (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          <div className="h-8 w-48 rounded-xl bg-secondary/50 animate-pulse" />
          <div className="h-40 rounded-2xl bg-secondary/50 animate-pulse" />
          <div className="h-36 rounded-2xl bg-secondary/50 animate-pulse" />
        </div>
      )}

      {!isLoading && data?.userType === "student" && <StudentCalendar />}
      {!isLoading && data?.userType === "staff" && <StaffCalendar />}

      {!isLoading && !data?.userType && (
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <CalendarDays className="h-10 w-10 opacity-25" />
            <p className="text-sm">
              {data?.reason === "not_in_daotao"
                ? t("calendar.page.notInDaoTao")
                : t("calendar.page.notLinked")}
            </p>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
