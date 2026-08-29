export function DueDateBadge({ dueDate }: { dueDate: string | null | undefined }) {
  if (!dueDate) return <span className="text-muted-foreground text-xs">—</span>;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) {
    return <span className="text-[11px] font-medium text-red-600">Quá hạn {Math.abs(days)} ngày</span>;
  }
  if (days === 0) {
    return <span className="text-[11px] font-medium text-green-600">Đến hạn hôm nay</span>;
  }
  if (days <= 7) {
    return <span className="text-[11px] font-medium text-orange-500">{days} ngày đến hạn</span>;
  }
  return <span className="text-muted-foreground text-xs">—</span>;
}
