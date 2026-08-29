import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PackagePlus, PackageMinus, ArrowLeftRight, BarChart3, ShoppingBag, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StoreConfigTab } from "./StoreConfigTab";
import { StoreProductTab } from "./StoreProductTab";
import { StoreReceiptTab } from "./StoreReceiptTab";
import { StoreIssueReceiptTab } from "./StoreIssueReceiptTab";
import { StoreInventoryTab } from "./StoreInventoryTab";
import { StoreTransferTab } from "./StoreTransferTab";

type StoreTab = "nhap-kho" | "xuat-kho" | "chuyen-kho" | "ton-kho" | "san-pham" | "cau-hinh";

const TABS: { value: StoreTab; label: string; icon: any }[] = [
  { value: "nhap-kho",   label: "Nhập kho",      icon: PackagePlus },
  { value: "xuat-kho",   label: "Xuất kho",       icon: PackageMinus },
  { value: "chuyen-kho", label: "Chuyển kho",     icon: ArrowLeftRight },
  { value: "ton-kho",    label: "Tồn kho",        icon: BarChart3 },
  { value: "san-pham",   label: "Sản phẩm",       icon: ShoppingBag },
  { value: "cau-hinh",   label: "Cấu hình kho",   icon: Settings2 },
];

function EmptyState({ tab }: { tab: StoreTab }) {
  const found = TABS.find(t => t.value === tab)!;
  const Icon = found.icon;
  return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
      <div className="p-5 rounded-2xl bg-muted/40">
        <Icon className="w-10 h-10 opacity-40" />
      </div>
      <p className="text-sm font-medium">{found.label} — Chức năng đang được phát triển</p>
    </div>
  );
}

export function StorePage() {
  const [activeTab, setActiveTab] = useState<StoreTab>("nhap-kho");

  return (
    <DashboardLayout fullscreen>
      <div className="h-full flex flex-col gap-4 p-6">
        {/* Main tab buttons */}
        <div className="shrink-0 flex flex-wrap gap-2">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary border-primary text-primary-foreground shadow-sm"
                    : "bg-background border-border text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content area - fills remaining height */}
        <div className="flex-1 min-h-0 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
          {activeTab === "cau-hinh" ? (
            <div className="p-5 overflow-y-auto">
              <StoreConfigTab />
            </div>
          ) : activeTab === "san-pham" ? (
            <StoreProductTab />
          ) : activeTab === "nhap-kho" ? (
            <StoreReceiptTab />
          ) : activeTab === "xuat-kho" ? (
            <StoreIssueReceiptTab />
          ) : activeTab === "ton-kho" ? (
            <StoreInventoryTab />
          ) : activeTab === "chuyen-kho" ? (
            <StoreTransferTab />
          ) : (
            <EmptyState tab={activeTab} />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default StorePage;
