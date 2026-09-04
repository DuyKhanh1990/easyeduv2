import { Link, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, LogOut, X } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ChatButton } from "@/components/chat/ChatButton";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocations } from "@/hooks/use-locations";
import { useLocationFilter } from "@/hooks/use-location-filter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { navigation, type NavItem, type NavModule } from "@/lib/sidebar-navigation";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { useMyPermissions, canAccessItem } from "@/hooks/use-my-permissions";
import { useTinodeContext } from "@/hooks/use-tinode";

const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.1.93";

function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  return (
    <div className="flex items-center bg-muted rounded-full p-0.5 text-[11px] font-semibold">
      <button
        onClick={() => setLang("vi")}
        className={cn(
          "px-2 py-0.5 rounded-full transition-all",
          lang === "vi" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        VIE
      </button>
      <button
        onClick={() => setLang("en")}
        className={cn(
          "px-2 py-0.5 rounded-full transition-all",
          lang === "en" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        ENG
      </button>
    </div>
  );
}

type SidebarProps = {
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
};

export function Sidebar({ mobileOpen, onMobileOpenChange }: SidebarProps = {}) {
  const isMobileSidebar = mobileOpen !== undefined;
  const [location] = useLocation();
  const { data: user } = useAuth();
  const logout = useLogout();
  const { data: locations } = useLocations();
  const { locationId, setLocation } = useLocationFilter();
  const { t, tNav } = useLanguage();
  const [expandedModules, setExpandedModules] = useState<string[]>([]);
  const [isCollapsedState, setIsCollapsedState] = useState(false);
  const [isHoveringCollapsed, setIsHoveringCollapsed] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  // DropdownMenuContent is portaled outside the sidebar. Keep the sidebar
  // expanded while the pointer moves from the trigger into that content,
  // otherwise onMouseLeave collapses the trigger and makes Radix reopen/close
  // the menu repeatedly.
  const isCollapsed = !mobileOpen && isCollapsedState && !isHoveringCollapsed && !isAccountMenuOpen;
  const { isModuleVisible, isItemVisible, hasServerData } = useSidebarVisibility();
  const { data: myPerms, isLoading: permsLoading } = useMyPermissions();
  const hasInitialized = useRef(false);

  const { topics } = useTinodeContext();
  const chatUnread = topics.reduce((sum, t) => sum + (t.unread ?? 0), 0);

  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const isStudent = myPerms?.isStudent ?? false;
  const systemDepartmentNames = myPerms?.systemDepartmentNames ?? [];
  const isSystemTrainingDept = systemDepartmentNames.some(n => n.toLowerCase().includes("đào tạo"));
  const isInSystemDept = systemDepartmentNames.length > 0;

  const hasItemAccess = (href: string): boolean => {
    if (isSuperAdmin) return true;
    if (permsLoading) return false;
    return canAccessItem(myPerms ?? undefined, href);
  };

  const hasNavItemAccess = (navItem: NavItem): boolean => {
    if (isSuperAdmin) return true;
    if (permsLoading) return false;
    // Hoa hồng is currently a placeholder tab and has no permission model yet.
    if (navItem.href === "/commission") return true;
    const permissionHref = navItem.permissionHref ?? navItem.href;
    if (navItem.subTabs && navItem.subTabs.length > 0) {
      return navItem.subTabs.some(tab =>
        canAccessItem(myPerms ?? undefined, `${permissionHref}#${tab.value}`)
      );
    }
    return canAccessItem(myPerms ?? undefined, permissionHref);
  };

  const hasDefaultAccess = (href: string, moduleName: string): boolean => {
    if (isSuperAdmin) return true;
    if (moduleName !== "MY SPACE") return true;
    if (isStudent) {
      // Học viên/Phụ huynh: lịch, bài tập, bảng điểm luôn thấy; hoá đơn kiểm tra quyền
      if (["/my-space/calendar", "/my-space/assignments", "/my-space/score-sheet", "/my-space/don-tu"].includes(href)) return true;
      if (href === "/my-space/invoices") return true; // permission check in getVisibleItems
      return false;
    }
    // Nếu admin đã lưu sidebar visibility settings, tôn trọng cài đặt đó — bỏ qua restriction phòng ban
    if (hasServerData) return true;
    // Chỉ nhân viên thuộc Phòng ban hệ thống (is_system=true) mới có quyền mặc định
    if (!isInSystemDept) return false;
    // Phòng ban hệ thống: lịch cá nhân, bài tập, bảng điểm mặc định
    if (["/my-space/calendar", "/my-space/assignments", "/my-space/score-sheet", "/my-space/don-tu"].includes(href)) return true;
    // Phòng Đào tạo hệ thống: thêm bảng lương mặc định
    if (isSystemTrainingDept && href === "/my-space/payroll") return true;
    // Hoá đơn: kiểm tra quyền (xử lý trong getVisibleItems)
    if (href === "/my-space/invoices") return true;
    return false;
  };

  const isModuleDefaultVisible = (moduleName: string): boolean => {
    if (isSuperAdmin) return true;
    if (isStudent) return moduleName === "MY SPACE";
    return true;
  };

  const getVisibleItems = (item: NavModule) =>
    item.items.filter(sub => {
      if (!isItemVisible(sub.href, item.module)) return false;
      if (!hasDefaultAccess(sub.href, item.module)) return false;
      if (item.module === "MY SPACE") {
        if (sub.href === "/my-space/invoices") {
          if (permsLoading) return false;
          if (isStudent) {
            // Kiểm tra quyền chặt chẽ: chỉ hiển thị nếu admin cấp canView=true (không dùng canViewAll cho học viên)
            const p = myPerms?.permissions?.["/my-space/invoices"];
            return !!p && p.canView === true;
          }
          return hasNavItemAccess(sub);
        }
        return true;
      }
      return hasNavItemAccess(sub);
    });

  useEffect(() => {
    if (permsLoading || hasInitialized.current) return;
    hasInitialized.current = true;
    const activeModule = (navigation as typeof navigation)
      .filter((entry): entry is NavModule => 'module' in entry)
      .find(item => item.items.some(sub => location === sub.href || location.startsWith(sub.href + "/")));
    setExpandedModules(activeModule ? [activeModule.module] : []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permsLoading, myPerms]);

  useEffect(() => {
    setIsCollapsedState(true);
    setIsHoveringCollapsed(false);
  }, [location]);

  const toggleModule = (moduleName: string) => {
    if (isCollapsed) {
      setIsCollapsedState(false);
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
    <>
      {isMobileSidebar && mobileOpen && (
        <button
          type="button"
          aria-label="Đóng menu"
          className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] lg:hidden"
          onClick={() => onMobileOpenChange?.(false)}
        />
      )}
      <div className={cn(
      "fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col bg-card border-r border-border card-shadow transition-transform duration-300 lg:static lg:z-10 lg:h-full lg:translate-x-0 lg:transition-all",
      isMobileSidebar
        ? (mobileOpen ? "translate-x-0" : "-translate-x-full")
        : "translate-x-0",
      isCollapsed ? "lg:w-20" : "lg:w-64"
    )}
      id={isMobileSidebar ? "mobile-module-menu" : undefined}
      onMouseEnter={() => {
        if (isCollapsedState) setIsHoveringCollapsed(true);
      }}
      onMouseLeave={() => {
        if (isCollapsedState) setIsHoveringCollapsed(false);
      }}
    >
      <div className={cn(
        "px-3 py-2 flex items-center justify-between border-b border-border/50",
        isCollapsed && "px-2 justify-center",
        isMobileSidebar && "min-h-14 px-4"
      )}>
        {!isCollapsed && (
          <div className="flex items-center gap-1">
            <NotificationBell />
            <ChatButton />
            {isSuperAdmin && <LanguageToggle />}
          </div>
        )}
        {isMobileSidebar && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Đóng menu"
            className="h-9 w-9 text-muted-foreground hover:text-primary lg:hidden"
            onClick={() => onMobileOpenChange?.(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        )}
        <div className={cn("ml-auto", isMobileSidebar ? "hidden lg:block" : "block")}>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8 text-muted-foreground hover:text-primary", isCollapsed && "mx-auto")}
            onClick={() => {
              setIsCollapsedState(prev => !prev);
              setIsHoveringCollapsed(false);
            }}
          >
            {isCollapsed
              ? <ChevronRight className="h-5 w-5" />
              : <ChevronRight className="h-5 w-5 rotate-180" />
            }
          </Button>
        </div>
      </div>

      <div className={cn(
        "flex-1 overflow-y-auto py-6 px-4 space-y-4",
        isCollapsed && "px-2"
      )}>
        {navigation.map((item) => {
          if ('href' in item) {
            if (isStudent && item.href === "/") return null;
            if (!isItemVisible(item.href)) return null;
            // Học viên/Phụ huynh: kiểm tra canView cho Chat và Zalo OA
            if (isStudent && item.href !== "/" && !permsLoading && myPerms) {
              if (!canAccessItem(myPerms, item.href)) return null;
            }
            // Ẩn nếu role đã được cấu hình quyền nhưng không có quyền truy cập trang này
            if (!isSuperAdmin && !isStudent && !permsLoading && myPerms) {
              const hasAnyPerms = Object.keys(myPerms.permissions).length > 0;
              if (hasAnyPerms && !hasNavItemAccess(item)) return null;
            }
            const isActive = location === item.href;
            return (
                  <Link href={item.href} onClick={() => isMobileSidebar && onMobileOpenChange?.(false)} className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 group",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                isCollapsed && "justify-center px-0"
              )}>
                <div className="relative shrink-0">
                  <item.icon className={cn("h-5 w-5", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")} />
                  {/* Collapsed: show count badge on icon; Expanded: show count badge at end of row (not both) */}
                  {isCollapsed && item.href === "/chat" && chatUnread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-0.5 leading-none shadow-sm">
                      {chatUnread > 99 ? "99+" : chatUnread}
                    </span>
                  )}
                </div>
                {!isCollapsed && <span className="whitespace-nowrap">{tNav(item.name)}</span>}
                {!isCollapsed && item.href === "/chat" && chatUnread > 0 && (
                  <span className="ml-auto bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-sm">
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </Link>
            );
          }

          if (!isModuleVisible(item.module)) return null;
          if (!isModuleDefaultVisible(item.module)) return null;

          const visibleItems = getVisibleItems(item);
          if (visibleItems.length === 0) return null;

          const isExpanded = expandedModules.includes(item.module) && !isCollapsed;

          return (
            <div key={item.module} className="space-y-1">
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
                  {!isCollapsed && (
                    <span className="text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                      {tNav(item.module)} <span className="font-normal opacity-60">({visibleItems.length})</span>
                    </span>
                  )}
                </div>
                {!isCollapsed && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
              </button>

              {isExpanded && !isCollapsed && (
                <div className="space-y-1 mt-1">
                  {visibleItems.map((subItem) => {
                    const isActive = location === subItem.href;
                    return (
                      <Link key={subItem.name} href={subItem.href} onClick={() => isMobileSidebar && onMobileOpenChange?.(false)} title={tNav(subItem.name)} className={cn(
                        "flex items-center gap-2 pl-7 pr-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 group",
                        isActive 
                          ? "bg-primary/10 text-primary" 
                          : "text-foreground/70 hover:bg-secondary hover:text-foreground"
                      )}>
                        <subItem.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
                        <span className="truncate">{tNav(subItem.name)}</span>
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
        <DropdownMenu open={isAccountMenuOpen} onOpenChange={setIsAccountMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-secondary/60 transition-colors",
              isCollapsed && "px-0 justify-center"
            )}>
              <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-tr from-primary to-primary/60 text-white flex items-center justify-center font-bold shadow-inner">
                {user?.username?.charAt(0).toUpperCase() || 'A'}
              </div>
              {!isCollapsed && (
                <>
                  <div className="flex flex-col overflow-hidden text-left flex-1 min-w-0">
                    <span className="text-sm font-semibold text-foreground truncate">{user?.username || 'Admin'}</span>
                    <span className="text-xs text-muted-foreground capitalize">{t("sidebar.system")}</span>
                    <span className="text-[10px] leading-none text-muted-foreground/70 mt-0.5">Version {APP_VERSION}</span>
                  </div>
                  <LogOut className="w-4 h-4 text-muted-foreground shrink-0 ml-1" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" side="top" align="start" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.username}</p>
                <p className="text-xs leading-none text-muted-foreground uppercase">
                  ID: {user?.id?.split('-')[0]}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout.mutate()}
              className="text-destructive focus:bg-destructive/10 cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>{t("sidebar.logout")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
    </>
  );
}
