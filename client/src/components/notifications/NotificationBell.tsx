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
import type { Notification } from "@shared/schema";

function getRelativeTimeVi(dateInput: string | Date): string {
  const date = typeof dateInput === "string"
    ? new Date(dateInput.endsWith("Z") || dateInput.includes("+") ? dateInput : dateInput + "Z")
    : dateInput;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "Vừa xong";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;
  return `${Math.floor(months / 12)} năm trước`;
}

function RelativeTime({ dateStr }: { dateStr: string }) {
  const [label, setLabel] = useState(() => getRelativeTimeVi(dateStr));
  useEffect(() => {
    const tick = () => setLabel(getRelativeTimeVi(dateStr));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [dateStr]);
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

function renderNotificationContent(content: string) {
  // Schedule/deletion notification: highlight deletion phrases in red+bold
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

  // Content notification: detect "bao gồm: " anywhere in content
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

  // Finance paid notification: highlight "Đã thanh toán" in green+bold
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

  // Review notification: highlight "Nhận xét học viên"
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

  // Attendance notification: color the status word
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

function NotificationItem({ notification, onRead }: {
  notification: Notification;
  onRead: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const dotColor = CATEGORY_COLORS[notification.category ?? "general"] ?? "bg-primary";
  const isLong = notification.content.length > COLLAPSE_THRESHOLD;

  return (
    <div
      className={cn(
        "flex gap-3 p-3 rounded-lg transition-colors hover:bg-muted/50 group",
        !notification.isRead && "bg-primary/5"
      )}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className="flex-shrink-0 mt-1">
        <span className={cn("inline-block w-2 h-2 rounded-full", dotColor, notification.isRead && "opacity-30")} />
      </div>

      <div className="flex-1 min-w-0">
        {notification.title && (
          <p className={cn("text-sm font-medium leading-snug", notification.isRead && "text-muted-foreground")}>
            {notification.title}
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
              <><ChevronUp className="w-3 h-3" />Thu gọn</>
            ) : (
              <><ChevronDown className="w-3 h-3" />Xem thêm</>
            )}
          </button>
        )}
        <p className="text-[11px] text-muted-foreground mt-1">
          <RelativeTime dateStr={typeof notification.createdAt === "string" ? notification.createdAt : new Date(notification.createdAt).toISOString()} />
        </p>
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

  const { data: notifications = [], isLoading } = useNotifications();
  const unreadCount = useUnreadCount();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  return (
    <Popover>
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
            <h3 className="text-sm font-semibold">Thông báo</h3>
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
              Đọc tất cả
            </Button>
          )}
        </div>

        <ScrollArea className="h-[360px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
              Đang tải...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Bell className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">Không có thông báo</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {notifications.map((noti) => (
                <NotificationItem
                  key={noti.id}
                  notification={noti}
                  onRead={(id) => markAsRead.mutate(id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
