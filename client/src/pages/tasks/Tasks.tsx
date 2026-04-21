import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { ListTodo } from "lucide-react";
import { TaskList } from "./components/TaskList";
import { TaskStatusConfig } from "./components/TaskStatusConfig";
import { TaskLevelConfig } from "./components/TaskLevelConfig";

const TASKS_HREF = "/tasks";
const LIST_RESOURCE = "/tasks#list";
const CONFIG_RESOURCE = "/tasks#config";

const TASKS_TABS = [
  { value: "list",   label: "Danh sách công việc" },
  { value: "config", label: "Cấu hình công việc" },
];

export default function Tasks() {
  const { isSubTabVisible } = useSidebarVisibility();
  const { data: myPerms, isLoading: permsLoading } = useMyPermissions();

  const getResourcePerms = (resource: string) => {
    if (!myPerms) return { canView: false, canViewAll: false, canCreate: false, canEdit: false, canDelete: false, isSuperAdmin: false };
    if (myPerms.isSuperAdmin) return { canView: true, canViewAll: true, canCreate: true, canEdit: true, canDelete: true, isSuperAdmin: true };
    const p = myPerms.permissions[resource];
    if (!p) return { canView: false, canViewAll: false, canCreate: false, canEdit: false, canDelete: false, isSuperAdmin: false };
    return { ...p, isSuperAdmin: false };
  };

  const configPerms = getResourcePerms(CONFIG_RESOURCE);
  const listPerms = getResourcePerms(LIST_RESOURCE);
  const hasConfigAccess = configPerms.canView || configPerms.canViewAll;
  const hasListAccess = listPerms.canView || listPerms.canViewAll;

  const visibleTabs = TASKS_TABS.filter(t => {
    if (!isSubTabVisible(TASKS_HREF, t.value)) return false;
    if (!myPerms) return false;
    if (myPerms.isSuperAdmin) return true;
    if (t.value === "list") return hasListAccess;
    if (t.value === "config") return hasConfigAccess;
    return false;
  });

  const [activeTab, setActiveTab] = useState(() => visibleTabs[0]?.value || "list");

  useEffect(() => {
    if (!visibleTabs.find(t => t.value === activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].value);
    }
  }, [visibleTabs.map(t => t.value).join(",")]);

  if (permsLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-2">
            <ListTodo className="h-8 w-8 text-cyan-600" />
            Công việc
          </h1>
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        </div>
      </DashboardLayout>
    );
  }

  if (visibleTabs.length === 0) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-2">
            <ListTodo className="h-8 w-8 text-cyan-600" />
            Công việc
          </h1>
          <p className="text-muted-foreground">Bạn không có quyền truy cập vào mục này.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-2">
            <ListTodo className="h-8 w-8 text-cyan-600" />
            Công việc
          </h1>
          <p className="text-muted-foreground">Quản lý công việc và cấu hình</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-wrap gap-2 mb-4">
            {visibleTabs.map(t => (
              <button
                key={t.value}
                onClick={() => setActiveTab(t.value)}
                className={cn(
                  "px-3 py-1 rounded-md border text-xs font-medium transition-all",
                  activeTab === t.value
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-background border-border text-foreground hover:bg-muted/50"
                )}
                data-testid={`tab-${t.value}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <TabsContent value="list">
            <TaskList />
          </TabsContent>

          <TabsContent value="config">
            <div className="grid grid-cols-2 gap-6">
              <div className="border rounded-xl p-4 bg-card">
                <TaskStatusConfig perms={configPerms} />
              </div>
              <div className="border rounded-xl p-4 bg-card">
                <TaskLevelConfig perms={configPerms} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
