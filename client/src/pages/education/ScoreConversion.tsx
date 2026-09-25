import { BarChart3 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";

export default function ScoreConversion() {
  return (
    <DashboardLayout>
      <div className="p-4 md:p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
            <BarChart3 className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Bảng điểm quy đổi</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Trang đã sẵn sàng để bổ sung các tab con.
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            Chưa có nội dung.
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}