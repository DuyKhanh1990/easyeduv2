import { useEffect, useRef } from "react";
import { X, Bell } from "lucide-react";
import type { ReminderToast } from "@/hooks/use-task-reminder";

const AUTO_CLOSE_MS = 5000;

function SingleToast({
  toast,
  dismiss,
}: {
  toast: ReminderToast;
  dismiss: (taskId: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => dismiss(toast.taskId), AUTO_CLOSE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.taskId]);

  return (
    <div className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-80 pointer-events-auto">
      <div className="shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
        <Bell className="w-4 h-4 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-500 mb-0.5">10 phút nữa bạn có công việc:</p>
        <p className="text-sm font-bold text-gray-900 leading-snug mb-1">{toast.title}</p>
        {toast.studentNames.length > 0 && (
          <p className="text-xs text-gray-600">
            <span className="font-medium">Đối tượng:</span>{" "}
            {toast.studentNames.join(", ")}
          </p>
        )}
      </div>
      <button
        onClick={() => dismiss(toast.taskId)}
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function TaskReminderToastContainer({
  toasts,
  dismiss,
}: {
  toasts: ReminderToast[];
  dismiss: (taskId: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <SingleToast key={t.taskId} toast={t} dismiss={dismiss} />
      ))}
    </div>
  );
}
