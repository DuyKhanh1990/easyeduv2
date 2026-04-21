import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Wallet } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { TeacherSalaryTableList } from "./TeacherSalaryTableList";
import { TeacherSalaryPackages } from "./TeacherSalaryPackages";
import { TeacherSalaryStaffConfig } from "./TeacherSalaryStaffConfig";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { useMyPermissions } from "@/hooks/use-my-permissions";

type TabValue = "salary-tables" | "salary-packages" | "staff-config";

const HREF = "/teacher-salary";
const ALL_TABS = [
  { value: "salary-tables" as TabValue, label: "Bảng lương đứng lớp", resource: "/teacher-salary#salary-tables" },
  { value: "salary-packages" as TabValue, label: "Gói lương đứng lớp", resource: "/teacher-salary#salary-packages" },
  { value: "staff-config" as TabValue, label: "Cấu hình theo nhân sự", resource: "/teacher-salary#staff-config" },
];

function getTabFromUrl(): TabValue {
  if (typeof window === "undefined") return "salary-tables";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab === "salary-packages") return "salary-packages";
  if (tab === "staff-config") return "staff-config";
  return "salary-tables";
}

export function TeacherSalary() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabValue>(getTabFromUrl);
  const { isSubTabVisible } = useSidebarVisibility();
  const { data: myPerms } = useMyPermissions();

  const canAccessTab = (resource: string): boolean => {
    if (!myPerms) return true;
    if (myPerms.isSuperAdmin) return true;
    const perm = myPerms.permissions[resource];
    if (!perm) return false;
    return perm.canView || perm.canViewAll || perm.canCreate || perm.canEdit || perm.canDelete;
  };

  const visibleTabs = ALL_TABS.filter(
    t => isSubTabVisible(HREF, t.value) && canAccessTab(t.resource)
  );

  useEffect(() => {
    const tab = getTabFromUrl();
    if (tab !== activeTab) setActiveTab(tab);
  }, []);

  useEffect(() => {
    if (!visibleTabs.find(t => t.value === activeTab) && visibleTabs.length > 0) {
      handleTabChange(visibleTabs[0].value);
    }
  }, [visibleTabs.map(t => t.value).join(",")]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as TabValue);
    setLocation(`/teacher-salary?tab=${value}`);
  };

  const canShowTab = (resource: string) =>
    isSubTabVisible(HREF, ALL_TABS.find(t => t.resource === resource)?.value ?? "") &&
    canAccessTab(resource);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-orange-500" />
          <h1 className="text-xl font-bold text-foreground">Lương đứng lớp</h1>
        </div>

        {visibleTabs.length === 0 ? (
          <p className="text-muted-foreground">Tất cả các tab đã bị ẩn. Vui lòng bật lại trong Quản lý module.</p>
        ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <div className="flex flex-wrap gap-2 mb-4">
              {visibleTabs.map(t => (
                <button
                  key={t.value}
                  onClick={() => handleTabChange(t.value)}
                  data-testid={`tab-${t.value}`}
                  className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", activeTab === t.value ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}
                >{t.label}</button>
              ))}
            </div>

            {canShowTab("/teacher-salary#salary-tables") && (
              <TabsContent value="salary-tables" className="mt-4">
                <TeacherSalaryTableList />
              </TabsContent>
            )}

            {canShowTab("/teacher-salary#salary-packages") && (
              <TabsContent value="salary-packages" className="mt-4">
                <TeacherSalaryPackages />
              </TabsContent>
            )}

            {canShowTab("/teacher-salary#staff-config") && (
              <TabsContent value="staff-config" className="mt-4">
                <TeacherSalaryStaffConfig />
              </TabsContent>
            )}
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
