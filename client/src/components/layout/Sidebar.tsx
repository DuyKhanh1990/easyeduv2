import { Link, useLocation } from "wouter";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { 
  GraduationCap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { navigation, type NavItem } from "@/lib/sidebar-navigation";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { useMyPermissions, canAccessItem } from "@/hooks/use-my-permissions";

export function Sidebar() {
  const [location] = useLocation();
  const { data: user } = useAuth();
  const [expandedModules, setExpandedModules] = useState<string[]>(["MY SPACE", "CRM", "HRM", "EDUCATION", "FINANCE", "SETTING"]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { isModuleVisible, isItemVisible } = useSidebarVisibility();
  const { data: myPerms, isLoading: permsLoading } = useMyPermissions();

  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const isStudent = myPerms?.isStudent ?? false;
  const departmentNames = myPerms?.departmentNames ?? [];
  const isTrainingDept = departmentNames.some(
    (n) => n.toLowerCase().includes("đào tạo")
  );

  const hasItemAccess = (href: string): boolean => {
    if (isSuperAdmin) return true;
    if (permsLoading) return false;
    return canAccessItem(myPerms, href);
  };

  const hasNavItemAccess = (navItem: NavItem): boolean => {
    if (isSuperAdmin) return true;
    if (permsLoading) return false;
    if (navItem.subTabs && navItem.subTabs.length > 0) {
      return navItem.subTabs.some(tab =>
        canAccessItem(myPerms, `${navItem.href}#${tab.value}`)
      );
    }
    return canAccessItem(myPerms, navItem.href);
  };

  const hasDefaultAccess = (href: string, moduleName: string): boolean => {
    if (isSuperAdmin) return true;
    if (moduleName !== "MY SPACE") return true;
    if (isStudent) {
      return ["/my-space/calendar", "/my-space/assignments", "/my-space/score-sheet", "/my-space/invoices"].includes(href);
    }
    if (isTrainingDept) {
      return true;
    }
    return ["/my-space/invoices", "/my-space/payroll"].includes(href);
  };

  const isModuleDefaultVisible = (moduleName: string): boolean => {
    if (isSuperAdmin) return true;
    if (isStudent) return moduleName === "MY SPACE";
    return true;
  };

  const toggleModule = (moduleName: string) => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setExpandedModules([moduleName]);
      return;
    }
    setExpandedModules(prev => 
      prev.includes(moduleName) 
        ? prev.filter(m => m !== moduleName) 
        : [...prev, moduleName]
    );
  };

  return (
    <div className={cn(
      "hidden md:flex flex-col bg-card border-r border-border h-full card-shadow z-10 transition-all duration-300",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className={cn(
        "p-6 flex items-center justify-between border-b border-border/50",
        isCollapsed && "px-4 justify-center"
      )}>
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-xl text-primary">
              <GraduationCap className="h-6 w-6" />
            </div>
            <span className="font-display font-bold text-xl text-foreground whitespace-nowrap">EduManage</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronRight className="h-5 w-5 rotate-180" />}
        </Button>
      </div>

      <div className={cn(
        "flex-1 overflow-y-auto py-6 px-4 space-y-4",
        isCollapsed && "px-2"
      )}>
        {navigation.map((item) => {
          if ('href' in item) {
            const isActive = location === item.href;
            return (
              <TooltipProvider key={item.name} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href={item.href} className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 group",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      isCollapsed && "justify-center px-0"
                    )}>
                      <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
                      {!isCollapsed && <span className="whitespace-nowrap">{item.name}</span>}
                    </Link>
                  </TooltipTrigger>
                  {isCollapsed && <TooltipContent side="right">{item.name}</TooltipContent>}
                </Tooltip>
              </TooltipProvider>
            );
          }

          if (!isModuleVisible(item.module)) return null;
          if (!isModuleDefaultVisible(item.module)) return null;

          const visibleItems = item.items.filter(sub =>
            isItemVisible(sub.href, item.module) &&
            hasDefaultAccess(sub.href, item.module) &&
            (item.module === "MY SPACE" || hasNavItemAccess(sub))
          );
          if (visibleItems.length === 0) return null;

          const isExpanded = expandedModules.includes(item.module) && !isCollapsed;

          return (
            <div key={item.module} className="space-y-1">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => toggleModule(item.module)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-secondary/50",
                        item.color,
                        isCollapsed && "justify-center px-0"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && <span className="text-xs font-bold uppercase tracking-wider whitespace-nowrap">{item.module}</span>}
                      </div>
                      {!isCollapsed && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                    </button>
                  </TooltipTrigger>
                  {isCollapsed && <TooltipContent side="right">{item.module}</TooltipContent>}
                </Tooltip>
              </TooltipProvider>

              {isExpanded && !isCollapsed && (
                <div className="space-y-1 mt-1">
                  {visibleItems.map((subItem) => {
                    const isActive = location === subItem.href;
                    return (
                      <Link key={subItem.name} href={subItem.href} className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 group",
                        isActive 
                          ? "bg-primary/10 text-primary" 
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}>
                        <subItem.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
                        <span className="whitespace-nowrap">{subItem.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={cn("p-4 border-t border-border/50", isCollapsed && "p-2")}>
        <div className={cn("flex items-center gap-3 px-3 py-2", isCollapsed && "px-0 justify-center")}>
          <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-tr from-primary to-primary/60 text-white flex items-center justify-center font-bold shadow-inner">
            {user?.username?.charAt(0).toUpperCase() || 'A'}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-semibold text-foreground truncate">{user?.username || 'Admin'}</span>
              <span className="text-xs text-muted-foreground capitalize">Hệ thống</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
