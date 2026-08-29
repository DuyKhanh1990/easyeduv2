import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useTaskReminder } from "@/hooks/use-task-reminder";
import { TaskReminderToastContainer } from "@/components/notifications/TaskReminderToast";
import { PageGuideButton } from "@/components/guides/PageGuideDialog";
import { OmicallDialer } from "@/components/call/OmicallDialer";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

const GUIDE_PAGE_TITLES: Record<string, string> = {
  "/": "Tổng quan",
  "/staff": "Nhân sự",
  "/don-tu": "Đơn từ",
  "/commission": "Hoa hồng",
  "/shifts": "Quản lý ca làm việc",
  "/cham-cong": "Chấm công",
  "/teacher-salary": "Lương đứng lớp",
  "/tong-luong": "Tổng lương",
  "/learning-overview": "Tổng quan học tập",
  "/classes": "Lớp học",
  "/schedule": "Lịch học",
  "/attendance": "Điểm danh",
};

function getGuidePageTitle(location: string) {
  const pathname = location.split("?")[0].replace(/\/+$/, "") || "/";
  if (pathname === "/staff" || pathname === "/don-tu" || pathname === "/schedule" || pathname === "/my-space/don-tu" || pathname === "/my-space/invoices" || pathname === "/my-space/score-sheet") return null;
  const exactTitle = GUIDE_PAGE_TITLES[pathname];
  if (exactTitle) return exactTitle;

  if (pathname.startsWith("/customers")) return null;
  if (pathname.startsWith("/classes/")) return "Lớp học";
  if (pathname.startsWith("/assessments")) return "Đánh giá và kỳ thi";
  if (pathname.startsWith("/courses") || pathname.startsWith("/programs")) return "Khóa học";
  if (pathname.startsWith("/education-config")) return "Cấu hình đào tạo";
  if (pathname.startsWith("/finance")) return "Tài chính";
  if (pathname.startsWith("/settings")) return "Cài đặt";
  if (pathname.startsWith("/tasks")) return "Công việc";
  if (pathname.startsWith("/news-feed")) return "Bảng tin";
  if (pathname.startsWith("/chat")) return "Trò chuyện";
  return "trang này";
}

export function DashboardLayout({ children, fullscreen }: { children: ReactNode; fullscreen?: boolean }) {
  const { data: user, isLoading } = useAuth();
  const { toasts, dismiss } = useTaskReminder();
  const [location] = useLocation();
  const guidePageTitle = getGuidePageTitle(location);
  const contentRef = useRef<HTMLDivElement>(null);
  const guideMountRef = useRef<HTMLDivElement | null>(null);
  const [guideMount, setGuideMount] = useState<HTMLDivElement | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);

  useLayoutEffect(() => {
    if (!guidePageTitle) return;

    const content = contentRef.current;
    if (!content) return;

    const findActionGroup = () => {
      const visibleButtons = Array.from(content.querySelectorAll("button")).filter((button) => {
        if (guideMountRef.current?.contains(button)) return false;
        const rect = button.getBoundingClientRect();
        const styles = window.getComputedStyle(button);
        return rect.width > 0 && rect.height > 0 && styles.display !== "none" && styles.visibility !== "hidden";
      });

      if (visibleButtons.length === 0) return null;

      const buttonRects = visibleButtons.map((button) => button.getBoundingClientRect());
      const firstRowTop = Math.min(...buttonRects.map((rect) => rect.top));
      const firstRowButtons = visibleButtons.filter(
        (button) => button.getBoundingClientRect().top <= firstRowTop + 18,
      );
      const rightmostButton = firstRowButtons.reduce((rightmost, button) => {
        return button.getBoundingClientRect().right > rightmost.getBoundingClientRect().right
          ? button
          : rightmost;
      }, firstRowButtons[0]);

      let ancestor = rightmostButton.parentElement;
      while (ancestor && ancestor !== content) {
        const styles = window.getComputedStyle(ancestor);
        const rowButtons = Array.from(ancestor.querySelectorAll("button")).filter((button) => {
          if (guideMountRef.current?.contains(button)) return false;
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.top <= firstRowTop + 18;
        });

        if (styles.display.includes("flex") && rowButtons.length === firstRowButtons.length) {
          return ancestor;
        }
        ancestor = ancestor.parentElement;
      }

      return rightmostButton.parentElement;
    };

    const placeGuide = () => {
      const actionGroup = findActionGroup();
      if (!actionGroup) return;
      if (guideMountRef.current?.parentElement === actionGroup) return;

      guideMountRef.current?.remove();
      const mount = document.createElement("div");
      mount.className = "inline-flex shrink-0 items-center";
      actionGroup.appendChild(mount);
      guideMountRef.current = mount;
      setGuideMount(mount);
    };

    const frame = window.requestAnimationFrame(placeGuide);
    const observer = new MutationObserver(placeGuide);
    observer.observe(content, {
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", placeGuide);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", placeGuide);
      guideMountRef.current?.remove();
      guideMountRef.current = null;
      setGuideMount(null);
    };
  }, [guidePageTitle]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#ECEEF4]">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileOpenChange={setMobileMenuOpen} />
      <div ref={contentRef} className="flex-1 flex flex-col overflow-hidden relative">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-white/90 px-3 backdrop-blur-xl lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mở menu phân hệ"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-module-menu"
            className="h-10 w-10 text-foreground hover:bg-primary/10 hover:text-primary"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-orange-400 text-lg font-bold leading-none text-orange-500">
              E
            </div>
            <span className="truncate text-sm font-semibold text-foreground">EduManage</span>
          </div>
        </header>
        {guideMount && guidePageTitle && createPortal(
          <PageGuideButton pageTitle={guidePageTitle} />,
          guideMount,
        )}
        {fullscreen ? (
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        ) : (
          <main className="flex-1 overflow-y-auto scroll-smooth">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="h-full w-full p-4 md:p-6 lg:p-8"
            >
              {children}
            </motion.div>
          </main>
        )}
      </div>
      <OmicallDialer />
      <TaskReminderToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
