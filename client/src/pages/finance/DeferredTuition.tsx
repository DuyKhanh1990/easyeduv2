import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DeferredTuitionTab } from "./components/DeferredTuitionTab";

export default function DeferredTuition() {
  return (
    <DashboardLayout fullscreen>
      <div className="h-full flex flex-col gap-4 p-6 bg-slate-100">
        <div className="flex-1 min-h-0 flex flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-3">
            <h1 className="text-base font-semibold text-slate-800">Học phí trả sau</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Theo dõi học phí phát sinh theo buổi học và tạo phiếu thu.
            </p>
          </div>
          <div className="flex-1 min-h-0 flex flex-col border-t border-border/70 p-5">
            <DeferredTuitionTab />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}