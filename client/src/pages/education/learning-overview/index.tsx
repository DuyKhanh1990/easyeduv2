import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { TabKey } from "./types";
import { useOverviewTab } from "./hooks/useOverviewTab";
import { useStudentsEndingTab } from "./hooks/useStudentsEndingTab";
import { useClassesEndingTab } from "./hooks/useClassesEndingTab";
import { useChoBuBaoLuuTab } from "./hooks/useChoBuBaoLuuTab";
import { useGradeBookTab } from "./hooks/useGradeBookTab";
import { OverviewTab } from "./components/OverviewTab";
import { StudentsEndingTab } from "./components/StudentsEndingTab";
import { ClassesEndingTab } from "./components/ClassesEndingTab";
import { ChoBuBaoLuuTab } from "./components/ChoBuBaoLuuTab";
import { GradeBookTab } from "./components/GradeBookTab";
import { AssignmentsTab } from "./components/AssignmentsTab";
import { StudentReviewsTab } from "./components/StudentReviewsTab";
import { TeacherAttendanceTab } from "./components/TeacherAttendanceTab";
import { LeaveRequestTab } from "./components/LeaveRequestTab";

const ALL_OVERVIEW_TABS = [
  { value: "overview", label: "Tổng Quan Học viên", testId: "tab-overview" },
  { value: "students-ending", label: "Học viên sắp hết lịch", testId: "tab-students-ending" },
  { value: "classes-ending", label: "Lớp học sắp kết thúc", testId: "tab-classes-ending" },
  { value: "cho-bu-bao-luu", label: "Chờ bù - Bảo lưu", testId: "tab-cho-bu-bao-luu" },
  { value: "bang-diem", label: "Bảng điểm", testId: "tab-bang-diem" },
  { value: "bai-tap-ve-nha", label: "Bài tập về nhà", testId: "tab-bai-tap-ve-nha" },
  { value: "nhan-xet-hoc-vien", label: "Nhận xét học viên", testId: "tab-nhan-xet-hoc-vien" },
  { value: "cham-cong-giao-vien", label: "Chấm công giáo viên", testId: "tab-cham-cong-giao-vien" },
  { value: "xin-nghi", label: "Xin nghỉ", testId: "tab-xin-nghi" },
];

export function LearningOverview() {
  const { isSubTabVisible } = useSidebarVisibility();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const visibleTabs = ALL_OVERVIEW_TABS.filter(t => isSubTabVisible("/learning-overview", t.value));

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find(t => t.value === activeTab)) {
      setActiveTab(visibleTabs[0].value as TabKey);
    }
  }, [visibleTabs.map(t => t.value).join(","), activeTab]);

  const overview = useOverviewTab(activeTab === "overview");
  const studentsEnding = useStudentsEndingTab(activeTab === "students-ending");
  const classesEnding = useClassesEndingTab(activeTab === "classes-ending");
  const choBuBaoLuu = useChoBuBaoLuuTab(activeTab === "cho-bu-bao-luu");
  const gradeBook = useGradeBookTab(activeTab === "bang-diem");

  return (
    <DashboardLayout fullscreen>
      <div className="flex flex-col h-full bg-[#ECEEF4]">
        {/* Sticky tab bar */}
        <div className="shrink-0 bg-[#ECEEF4] px-4 md:px-6 lg:px-8 pt-4 md:pt-5 lg:pt-6 pb-3 flex flex-wrap gap-2">
          {visibleTabs.map(t => (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value as TabKey)}
              data-testid={t.testId}
              className={cn(
                "px-3 py-1 rounded-md border text-xs font-medium transition-all",
                activeTab === t.value
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-background border-border text-foreground hover:bg-muted/50"
              )}
            >{t.label}</button>
          ))}
        </div>

        {/* Bounded content area */}
        <div className="flex-1 overflow-hidden px-4 md:px-6 lg:px-8 pb-4">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabKey)}
            className="w-full h-full"
          >
            <TabsContent value="overview" className="h-full">
              <OverviewTab
                students={overview.students}
                totalClassRows={overview.totalClassRows}
                total={overview.total}
                page={overview.page}
                pageSize={overview.pageSize}
                onPageChange={overview.setPage}
                onPageSizeChange={overview.setPageSize}
                isLoading={overview.isLoading}
                filters={overview.filters}
                onFiltersChange={overview.setFilters}
                availableClasses={overview.availableClasses}
              />
            </TabsContent>

            <TabsContent value="students-ending" className="h-full">
              <StudentsEndingTab
                data={studentsEnding.data}
                total={studentsEnding.total}
                page={studentsEnding.page}
                pageSize={studentsEnding.pageSize}
                onPageChange={studentsEnding.setPage}
                onPageSizeChange={studentsEnding.setPageSize}
                isLoading={studentsEnding.isLoading}
                filters={studentsEnding.filters}
                onFiltersChange={(patch) =>
                  studentsEnding.setFilters((prev) => ({ ...prev, ...patch }))
                }
                availableClasses={studentsEnding.availableClasses}
              />
            </TabsContent>

            <TabsContent value="classes-ending" className="h-full">
              <ClassesEndingTab
                data={classesEnding.data}
                total={classesEnding.total}
                page={classesEnding.page}
                pageSize={classesEnding.pageSize}
                onPageChange={classesEnding.setPage}
                onPageSizeChange={classesEnding.setPageSize}
                isLoading={classesEnding.isLoading}
                filters={classesEnding.filters}
                onFiltersChange={(patch) =>
                  classesEnding.setFilters((prev) => ({ ...prev, ...patch }))
                }
                availableClasses={classesEnding.availableClasses}
              />
            </TabsContent>

            <TabsContent value="cho-bu-bao-luu" className="h-full">
              <ChoBuBaoLuuTab
                data={choBuBaoLuu.data}
                total={choBuBaoLuu.total}
                page={choBuBaoLuu.page}
                pageSize={choBuBaoLuu.pageSize}
                onPageChange={choBuBaoLuu.setPage}
                onPageSizeChange={choBuBaoLuu.setPageSize}
                isLoading={choBuBaoLuu.isLoading}
              />
            </TabsContent>

            <TabsContent value="bang-diem" className="h-full">
              <GradeBookTab
                data={gradeBook.data}
                total={gradeBook.total}
                page={gradeBook.page}
                pageSize={gradeBook.pageSize}
                isLoading={gradeBook.isLoading}
                filters={gradeBook.filters}
                locations={gradeBook.locations}
                onFiltersChange={(patch) => gradeBook.setFilters((prev) => ({ ...prev, ...patch }))}
                onPageChange={gradeBook.setPage}
                onPageSizeChange={gradeBook.setPageSize}
                onDelete={(book) => gradeBook.deleteMutation.mutate({ classId: book.classId, id: book.id })}
                onEdit={(book, data) => gradeBook.updateMutation.mutate({ classId: book.classId, id: book.id, data })}
                isDeleting={gradeBook.deleteMutation.isPending}
                isEditing={gradeBook.updateMutation.isPending}
              />
            </TabsContent>

            <TabsContent value="bai-tap-ve-nha" className="h-full">
              <AssignmentsTab enabled={activeTab === "bai-tap-ve-nha"} />
            </TabsContent>

            <TabsContent value="nhan-xet-hoc-vien" className="h-full">
              <StudentReviewsTab enabled={activeTab === "nhan-xet-hoc-vien"} />
            </TabsContent>

            <TabsContent value="cham-cong-giao-vien" className="h-full">
              <TeacherAttendanceTab enabled={activeTab === "cham-cong-giao-vien"} />
            </TabsContent>

            <TabsContent value="xin-nghi" className="h-full">
              <LeaveRequestTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}
