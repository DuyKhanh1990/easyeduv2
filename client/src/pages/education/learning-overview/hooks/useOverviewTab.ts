import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StudentClassData, GroupedStudent } from "../types";

export type OverviewFilters = {
  search: string;
  startFrom: string;
  startTo: string;
  endFrom: string;
  endTo: string;
  selectedClasses: string[];
  maxRemaining: string;
  selectedStatuses: string[];
};

function getStatus(sc: StudentClassData): string {
  if (!sc.startDate && !sc.endDate) return "waiting";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = sc.startDate ? new Date(sc.startDate) : null;
  const end = sc.endDate ? new Date(sc.endDate) : null;
  if (start && today < start) return "upcoming";
  if (end && today > end) return "ended";
  return "active";
}

export function useOverviewTab(enabled: boolean) {
  const [filters, setFilters] = useState<OverviewFilters>({
    search: "",
    startFrom: "",
    startTo: "",
    endFrom: "",
    endTo: "",
    selectedClasses: [],
    maxRemaining: "",
    selectedStatuses: [],
  });

  const { data = [], isLoading } = useQuery<StudentClassData[]>({
    queryKey: ["/api/student-classes"],
    enabled,
  });

  const availableClasses = useMemo(() => {
    const seen = new Set<string>();
    const result: { code: string; label: string }[] = [];
    data.forEach((sc) => {
      const key = sc.classCode || sc.className;
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push({ code: key, label: key });
      }
    });
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  const groupedStudents = useMemo<GroupedStudent[]>(() => {
    const term = filters.search.toLowerCase();
    const maxR = filters.maxRemaining !== "" ? Number(filters.maxRemaining) : null;
    const startFrom = filters.startFrom ? new Date(filters.startFrom) : null;
    const startTo = filters.startTo ? new Date(filters.startTo) : null;
    const endFrom = filters.endFrom ? new Date(filters.endFrom) : null;
    const endTo = filters.endTo ? new Date(filters.endTo) : null;

    const map = new Map<string, GroupedStudent>();
    data.forEach((sc) => {
      if (!map.has(sc.studentId)) {
        map.set(sc.studentId, {
          studentId: sc.studentId,
          studentCode: sc.studentCode,
          studentName: sc.studentName,
          classes: [],
        });
      }
      map.get(sc.studentId)!.classes.push(sc);
    });

    const result: GroupedStudent[] = [];
    for (const student of map.values()) {
      if (term && !`${student.studentCode} ${student.studentName}`.toLowerCase().includes(term)) {
        continue;
      }

      const matchingClasses = student.classes.filter((sc) => {
        if (filters.selectedClasses.length > 0) {
          const key = sc.classCode || sc.className;
          if (!filters.selectedClasses.includes(key)) return false;
        }
        if (maxR !== null && (sc.remainingSessions ?? 0) > maxR) return false;
        if (sc.startDate) {
          const start = new Date(sc.startDate);
          if (startFrom && start < startFrom) return false;
          if (startTo && start > startTo) return false;
        } else {
          if (startFrom || startTo) return false;
        }
        if (sc.endDate) {
          const end = new Date(sc.endDate);
          if (endFrom && end < endFrom) return false;
          if (endTo && end > endTo) return false;
        } else {
          if (endFrom || endTo) return false;
        }
        if (filters.selectedStatuses.length > 0) {
          const status = getStatus(sc);
          if (!filters.selectedStatuses.includes(status)) return false;
        }
        return true;
      });

      if (matchingClasses.length > 0) {
        result.push({ ...student, classes: matchingClasses });
      }
    }
    return result;
  }, [data, filters]);

  const totalClassRows = useMemo(
    () => groupedStudents.reduce((sum, s) => sum + s.classes.length, 0),
    [groupedStudents]
  );

  return {
    filteredStudents: groupedStudents,
    totalClassRows,
    isLoading,
    filters,
    setFilters,
    availableClasses,
  };
}
