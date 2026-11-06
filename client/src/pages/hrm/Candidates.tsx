import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default function Candidates() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Ứng viên</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Khu vực quản lý ứng viên sẽ được bổ sung sau.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
            <Users className="h-10 w-10 opacity-40" />
            <p className="text-sm">Chưa có dữ liệu ứng viên.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
