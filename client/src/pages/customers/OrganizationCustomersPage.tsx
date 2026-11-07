import { Building2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export function OrganizationCustomersPage() {
  return (
    <DashboardLayout>
      <div className="p-4 md:p-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Building2 className="h-6 w-6 text-primary" />
          Trung tâm/Doanh nghiệp
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Chức năng quản lý khách hàng trung tâm/doanh nghiệp sẽ được bổ sung sau.
        </p>
      </div>
    </DashboardLayout>
  );
}
