import { useState, useEffect } from "react";
import { Bell, Check, CheckCheck, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
  useNotificationWebSocket,
} from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import type { Notification } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";
import type { Language } from "@/hooks/use-language";
import { useMyPermissions } from "@/hooks/use-my-permissions";

function getRelativeTime(dateInput: string | Date, lang: Language): string {
  const date = typeof dateInput === "string"
    ? new Date(dateInput.endsWith("Z") || dateInput.includes("+") ? dateInput : dateInput + "Z")
    : dateInput;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return lang === "en" ? "Just now" : "Vừa xong";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return lang === "en" ? "Just now" : "Vừa xong";
  if (mins < 60) return lang === "en" ? `${mins}m ago` : `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === "en" ? `${hours}h ago` : `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return lang === "en" ? `${days}d ago` : `${days} ngày trước`;
  const months = Math.floor(days / 30);
  if (months < 12) return lang === "en" ? `${months}mo ago` : `${months} tháng trước`;
  return lang === "en" ? `${Math.floor(months / 12)}y ago` : `${Math.floor(months / 12)} năm trước`;
}

function RelativeTime({ dateStr }: { dateStr: string }) {
  const { lang } = useLanguage();
  const [label, setLabel] = useState(() => getRelativeTime(dateStr, lang));
  useEffect(() => {
    const tick = () => setLabel(getRelativeTime(dateStr, lang));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [dateStr, lang]);
  return <>{label}</>;
}

const CATEGORY_COLORS: Record<string, string> = {
  task: "bg-blue-500",
  invoice: "bg-green-500",
  assignment: "bg-purple-500",
  class: "bg-orange-500",
  attendance: "bg-green-500",
  review: "bg-blue-500",
  content: "bg-orange-500",
  schedule: "bg-yellow-500",
  general: "bg-primary",
};

const ATTENDANCE_STATUS_COLOR: Record<string, string> = {
  "Có học": "#16a34a",
  "Vắng": "#ef4444",
  "Chờ học bù": "#f97316",
  "Đã học bù": "#3b82f6",
  "Huỷ": "#6b7280",
  "Chưa điểm danh": "#6b7280",
};

const DELETION_PHRASES = [
  "vừa được xoá ra khỏi",
  "vừa được xoá",
  "được xoá từ",
  "được xoá",
];

/**
 * Extract date from notification content.
 * Supports both DD/MM/YYYY (4-digit year) and DD/MM/YY (2-digit year).
 * Returns YYYY-MM-DD or null.
 */
function extractDateFromContent(content: string): string | null {
  const match4 = content.match(/(\d{2})\/(\d{2})\/(20\d{2})(?!\d)/);
  if (match4) {
    const [, d, m, y] = match4;
    return `${y}-${m}-${d}`;
  }
  const match2 = content.match(/(\d{2})\/(\d{2})\/(\d{2})(?!\d)/);
  if (!match2) return null;
  const [, d, m, y] = match2;
  return `20${y}-${m}-${d}`;
}

/**
 * Map notification → route, tuỳ theo người xem là học viên (my-space) hay
 * nhân viên (trang quản trị nội bộ). Ưu tiên `deeplink` đã được tính sẵn tại
 * thời điểm tạo notification (nguồn chính, chính xác — có đủ classId/sessionId/
 * invoiceId/taskId); chỉ suy luận lại từ category/referenceType cho các
 * notification cũ chưa có cột deeplink (fallback).
 */
function routeFromDeeplink(
  deeplink: { screen: string; params?: Record<string, string> },
  _isStudent: boolean,
): string | null {
  const params = deeplink.params ?? {};

  switch (deeplink.screen) {
    case "ScoreSheet":
      return "/my-space/score-sheet";

    case "Invoices":
      return params.invoiceId
        ? `/my-space/invoices?invoiceId=${params.invoiceId}`
        : "/my-space/invoices";

    case "Assignments": {
      // Điều hướng đến đúng buổi trên calendar (date + classId từ lúc tạo noti).
      // Fallback về /my-space/assignments nếu không có date.
      if (params.date) {
        const base = `/my-space/calendar?date=${params.date}`;
        return params.classId ? `${base}&classId=${params.classId}` : base;
      }
      return "/my-space/assignments";
    }

    case "Calendar": {
      const base = params.date ? `/my-space/calendar?date=${params.date}` : "/my-space/calendar";
      return params.classId && params.date ? `${base}&classId=${params.classId}` : base;
    }

    case "Payroll":
      return "/my-space/payroll";

    case "StaffTasks":
      return "/tasks";

    case "Chat":
      return params.topicId ? `/chat?topicId=${params.topicId}` : "/chat";

    default:
      return null;
  }
}

function getNotificationRoute(notification: Notification, isStudent: boolean): string | null {
  const storedDeeplink = (notification as any).deeplink as
    | { screen: string; params?: Record<string, string> }
    | null
    | undefined;
  if (storedDeeplink?.screen) {
    const route = routeFromDeeplink(storedDeeplink, isStudent);
    if (route) return route;
  }

  // ── Fallback: suy luận từ category/referenceType — chỉ áp dụng cho các
  // notification cũ được tạo trước khi có cột deeplink ────────────────────
  const category = notification.category ?? "general";
  const refType  = notification.referenceType ?? "";
  const title    = (notification.title ?? "").toLowerCase();
  const content  = (notification.content ?? "").toLowerCase();

  const refDate = ((notification as any).referenceDate as string | null | undefined)?.slice(0, 10) || null;
  const classId = notification.referenceId;

  if (
    title.includes("bảng điểm") ||
    content.includes("bảng điểm") ||
    refType === "score_sheet" ||
    refType === "grade_book"
  ) {
    return "/my-space/score-sheet";
  }

  if (category === "finance" || refType === "invoice") {
    return notification.referenceId
      ? `/my-space/invoices?invoiceId=${notification.referenceId}`
      : "/my-space/invoices";
  }

  if (category === "content" || category === "assignment" ||
      ["assignment", "homework", "content"].includes(refType)) {
    const date = refDate || extractDateFromContent(notification.content);
    if (date) {
      const base = `/my-space/calendar?date=${date}`;
      return classId ? `${base}&classId=${classId}` : base;
    }
    return "/my-space/assignments";
  }

  if (
    category === "attendance" ||
    category === "schedule"   ||
    category === "class"      ||
    category === "review"     ||
    ["session", "class", "schedule", "attendance"].includes(refType)
  ) {
    const date = refDate || extractDateFromContent(notification.content);
    const base = date ? `/my-space/calendar?date=${date}` : "/my-space/calendar";
    return classId && date ? `${base}&classId=${classId}` : base;
  }

  if (category === "task") {
    return "/tasks";
  }

  if (category === "chat" || refType === "class_chat" || refType === "group_chat") {
    return notification.referenceId ? `/chat?topicId=${notification.referenceId}` : "/chat";
  }

  return null;
}

function renderNotificationContent(content: string) {
  for (const phrase of DELETION_PHRASES) {
    const idx = content.indexOf(phrase);
    if (idx !== -1) {
      return (
        <>
          <span>{content.slice(0, idx)}</span>
          <span style={{ color: "#ef4444", fontWeight: 700 }}>{phrase}</span>
          <span>{content.slice(idx + phrase.length)}</span>
        </>
      );
    }
  }

  const baoGomMarker = "bao gồm: ";
  const baoGomIdx = content.indexOf(baoGomMarker);
  if (baoGomIdx !== -1) {
    const header = content.slice(0, baoGomIdx).replace(/[\n,]+$/, "").trimEnd();
    const detail = content.slice(baoGomIdx + baoGomMarker.length);
    const giaoPhrase = "Giao nội dung";
    const giaoIdx = header.indexOf(giaoPhrase);
    const headerNode = giaoIdx !== -1 ? (
      <>
        <span>{header.slice(0, giaoIdx)}</span>
        <span style={{ color: "#2563eb", fontWeight: 700 }}>{giaoPhrase}</span>
        <span>{header.slice(giaoIdx + giaoPhrase.length)}</span>
      </>
    ) : <span>{header}</span>;

    return (
      <>
        {headerNode}
        {"\n"}
        <span style={{ color: "#ea580c" }}>{"bao gồm: " + detail}</span>
      </>
    );
  }

  const paidPhrase = "Đã thanh toán";
  const paidIdx = content.indexOf(paidPhrase);
  if (paidIdx !== -1) {
    return (
      <>
        <span>{content.slice(0, paidIdx)}</span>
        <span style={{ color: "#16a34a", fontWeight: 700 }}>{paidPhrase}</span>
        <span>{content.slice(paidIdx + paidPhrase.length)}</span>
      </>
    );
  }

  const reviewPhrase = "Nhận xét học viên";
  const reviewIdx = content.indexOf(reviewPhrase);
  if (reviewIdx !== -1) {
    return (
      <>
        <span>{content.slice(0, reviewIdx)}</span>
        <span style={{ color: "#2563eb", fontWeight: 700 }}>{reviewPhrase}</span>
        <span>{content.slice(reviewIdx + reviewPhrase.length)}</span>
      </>
    );
  }

  const marker = "Điểm danh: ";
  const markerIdx = content.indexOf(marker);
  if (markerIdx !== -1) {
    const before = content.slice(0, markerIdx + marker.length);
    const after = content.slice(markerIdx + marker.length);
    const commaIdx = after.indexOf(", ");
    const statusWord = commaIdx !== -1 ? after.slice(0, commaIdx) : after;
    const rest = commaIdx !== -1 ? after.slice(commaIdx) : "";
    const color = ATTENDANCE_STATUS_COLOR[statusWord];
    return (
      <>
        <span>{before}</span>
        {color
          ? <span style={{ color, fontWeight: 700 }}>{statusWord}</span>
          : <span>{statusWord}</span>
        }
        <span>{rest}</span>
      </>
    );
  }

  return <span>{content}</span>;
}

const COLLAPSE_THRESHOLD = 120;

function NotificationItem({ notification, isStudent, onRead, onNavigate }: {
  notification: Notification;
  isStudent: boolean;
  onRead: (id: string) => void;
  onNavigate: (route: string) => void;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const dotColor = CATEGORY_COLORS[notification.category ?? "general"] ?? "bg-primary";
  const isLong = notification.content.length > COLLAPSE_THRESHOLD;
  const route = getNotificationRoute(notification, isStudent);
  const isClickable = !!route;

  function handleClick() {
    if (!notification.isRead) {
      onRead(notification.id);
    }
    if (route) {
      onNavigate(route);
    }
  }

  return (
    <div
      className={cn(
        "flex gap-3 p-3 rounded-lg transition-colors hover:bg-muted/50 group",
        !notification.isRead && "bg-primary/5",
        isClickable && "cursor-pointer"
      )}
      onClick={isClickable ? handleClick : undefined}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className="flex-shrink-0 mt-1">
        <span className={cn("inline-block w-2 h-2 rounded-full", dotColor, notification.isRead && "opacity-30")} />
      </div>

      <div className="flex-1 min-w-0">
        {notification.title && (
          <p className={cn(
            "text-sm font-medium leading-snug",
            notification.isRead && "text-muted-foreground",
            isClickable && "group-hover:text-primary transition-colors"
          )}>
            {notification.title === "Hoá đơn quá hạn" ? (
              <span style={{ color: "#dc2626", fontWeight: 700 }}>{notification.title}</span>
            ) : notification.title === "Hoá đơn sắp đến hạn" ? (
              <span style={{ color: "#d97706", fontWeight: 700 }}>{notification.title}</span>
            ) : (
              notification.title
            )}
          </p>
        )}
        <p
          className={cn(
            "text-xs mt-0.5 leading-relaxed whitespace-pre-line",
            notification.isRead ? "text-muted-foreground" : "text-foreground/80",
            !expanded && isLong && "line-clamp-3"
          )}
        >
          {renderNotificationContent(notification.content)}
        </p>
        {isLong && (
          <button
            className="text-[11px] text-primary mt-0.5 flex items-center gap-0.5 hover:underline"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            data-testid={`btn-expand-notification-${notification.id}`}
          >
            {expanded ? (
              <><ChevronUp className="w-3 h-3" />{t("notification.collapse")}</>
            ) : (
              <><ChevronDown className="w-3 h-3" />{t("notification.expand")}</>
            )}
          </button>
        )}
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[11px] text-muted-foreground">
            <RelativeTime dateStr={typeof notification.createdAt === "string" ? notification.createdAt : new Date(notification.createdAt).toISOString()} />
          </p>
          {isClickable && (
            <span className="text-[10px] text-primary/60 opacity-0 group-hover:opacity-100 transition-opacity">
              {t("notification.viewDetail")}
            </span>
          )}
        </div>
      </div>

      {!notification.isRead && (
        <div className="flex-shrink-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => { e.stopPropagation(); onRead(notification.id); }}
            data-testid={`btn-mark-read-${notification.id}`}
          >
            <Check className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function NotificationBell() {
  useNotificationWebSocket();

  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { t } = useLanguage();
  const { data: myPerms } = useMyPermissions();
  const isStudent = !!myPerms?.isStudent;

  const { data: allNotifications = [], isLoading } = useNotifications();
  const notifications = allNotifications.filter((n) => n.category !== "chat");
  const unreadCount = useUnreadCount();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  function handleNavigate(route: string) {
    setOpen(false);
    navigate(route);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative w-10 h-10 rounded-full hover:bg-secondary"
          data-testid="btn-notification-bell"
        >
          <Bell className="h-5 w-5 text-foreground/80" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-destructive rounded-full border-2 border-background text-[10px] text-white font-bold flex items-center justify-center px-1 leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-96 p-0 shadow-lg"
        data-testid="notification-panel"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{t("notification.title")}</h3>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[11px]">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-primary hover:text-primary"
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
              data-testid="btn-mark-all-read"
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1" />
              {t("notification.markAll")}
            </Button>
          )}
        </div>

        <ScrollArea className="h-[360px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
              {t("notification.loading")}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Bell className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">{t("notification.empty")}</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {notifications.map((noti) => (
                <NotificationItem
                  key={noti.id}
                  notification={noti}
                  isStudent={isStudent}
                  onRead={(id) => markAsRead.mutate(id)}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
