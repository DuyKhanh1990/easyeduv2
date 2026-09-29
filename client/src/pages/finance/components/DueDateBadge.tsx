import { useLanguage } from "@/hooks/use-language";

export function DueDateBadge({ dueDate }: { dueDate: string | null | undefined }) {
  const { t } = useLanguage();
  if (!dueDate) return <span className="text-slate-500 text-[11px] font-medium">{t("finance.noDueDate")}</span>;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) {
    return <span className="text-[11px] font-medium text-red-600">{t("finance.overdueDays", { days: Math.abs(days) })}</span>;
  }
  if (days === 0) {
    return <span className="text-[11px] font-medium text-green-600">{t("finance.dueToday")}</span>;
  }
  if (days <= 7) {
    return <span className="text-[11px] font-medium text-orange-500">{t("finance.dueSoonDays", { days })}</span>;
  }
  return <span className="text-[11px] font-medium text-blue-600">{t("finance.notDue")}</span>;
}
