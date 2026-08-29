import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getAuthHeaders } from "@/lib/queryClient";
import type { Task } from "@shared/schema";

export interface ReminderToast {
  taskId: string;
  title: string;
  studentNames: string[];
}

const REMIND_BEFORE_MS = 10 * 60 * 1000;
const WINDOW_MS = 60 * 1000;

function getNotifiedKey(userId: string) {
  return `task_reminded_${userId}`;
}

function loadNotified(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(getNotifiedKey(userId));
    if (!raw) return new Set();
    const obj: Record<string, number> = JSON.parse(raw);
    const now = Date.now();
    const filtered = Object.fromEntries(
      Object.entries(obj).filter(([, ts]) => now - ts < 24 * 60 * 60 * 1000)
    );
    localStorage.setItem(getNotifiedKey(userId), JSON.stringify(filtered));
    return new Set(Object.keys(filtered));
  } catch {
    return new Set();
  }
}

function saveNotified(userId: string, taskId: string) {
  try {
    const key = getNotifiedKey(userId);
    const raw = localStorage.getItem(key);
    const obj: Record<string, number> = raw ? JSON.parse(raw) : {};
    obj[taskId] = Date.now();
    localStorage.setItem(key, JSON.stringify(obj));
  } catch { /* ignore */ }
}

export function useTaskReminder() {
  const { data: user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/tasks", {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : (data?.tasks ?? data?.data ?? data?.items ?? []);
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    enabled: !!userId,
  });

  const [toasts, setToasts] = useState<ReminderToast[]>([]);

  const hasTasksWithDueDate = tasks.some(t => t.dueDate);

  const { data: students = [] } = useQuery<{ id: string; fullName: string; code: string }[]>({
    queryKey: ["/api/students/minimal-reminder"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/students?minimal=true", {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : (data?.students ?? data?.data ?? []);
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60_000,
    enabled: !!userId && hasTasksWithDueDate,
  });

  const studentMap = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const map = new Map<string, string>();
    for (const s of students) {
      map.set(s.id, `${s.fullName}${s.code ? ` (${s.code})` : ""}`);
    }
    studentMap.current = map;
  }, [students]);

  useEffect(() => {
    if (!userId) return;

    function check() {
      const now = Date.now();
      const notified = loadNotified(userId!);
      const newToasts: ReminderToast[] = [];

      for (const task of tasks) {
        if (!task.dueDate) continue;
        if (notified.has(task.id)) continue;

        const due = new Date(task.dueDate as string).getTime();
        const diff = due - now;

        if (diff > REMIND_BEFORE_MS - WINDOW_MS && diff <= REMIND_BEFORE_MS + WINDOW_MS) {
          const studentNames = ((task.subjectIds ?? []) as string[])
            .map(id => studentMap.current.get(id))
            .filter(Boolean) as string[];

          saveNotified(userId!, task.id);
          newToasts.push({ taskId: task.id, title: task.title ?? "", studentNames });

          fetch("/api/notifications/reminder", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({
              title: "Nhắc việc sắp đến hạn",
              content: `10 phút nữa bạn có công việc: ${task.title}${studentNames.length ? `\nĐối tượng: ${studentNames.join(", ")}` : ""}`,
              referenceId: task.id,
              referenceType: "task",
            }),
          }).then(() => {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          }).catch(() => { /* ignore */ });
        }
      }

      if (newToasts.length > 0) {
        setToasts(prev => [...prev, ...newToasts]);
      }
    }

    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [userId, tasks, queryClient]);

  const dismiss = useCallback((taskId: string) => {
    setToasts(prev => prev.filter(t => t.taskId !== taskId));
  }, []);

  return { toasts, dismiss };
}
