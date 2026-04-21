import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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

export function LearningOverview() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const overview = useOverviewTab(activeTab === "overview");
  const studentsEnding = useStudentsEndingTab(activeTab === "students-ending");
  const classesEnding = useClassesEndingTab(activeTab === "classes-ending");
  const choBuBaoLuu = useChoBuBaoLuuTab(activeTab === "cho-bu-bao-luu");
  const gradeBook = useGradeBookTab(activeTab === "bang-diem");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabKey)}
          className="w-full"
        >
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { value: "overview", label: "Tổng Quan Học viên", testId: "tab-overview" },
              { value: "students-ending", label: "Học viên sắp hết lịch", testId: "tab-students-ending" },
              { value: "classes-ending", label: "Lớp học sắp kết thúc", testId: "tab-classes-ending" },
              { value: "cho-bu-bao-luu", label: "Chờ bù - Bảo lưu", testId: "tab-cho-bu-bao-luu" },
              { value: "bang-diem", label: "Bảng điểm", testId: "tab-bang-diem" },
              { value: "bai-tap-ve-nha", label: "Bài tập về nhà", testId: "tab-bai-tap-ve-nha" },
              { value: "nhan-xet-hoc-vien", label: "Nhận xét học viên", testId: "tab-nhan-xet-hoc-vien" },
            ].map(t => (
              <button
                key={t.value}
                onClick={() => setActiveTab(t.value as TabKey)}
                data-testid={t.testId}
                className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all", activeTab === t.value ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}
              >{t.label}</button>
            ))}
          </div>

          <TabsContent value="overview">
            <OverviewTab
              filteredStudents={overview.filteredStudents}
              totalClassRows={overview.totalClassRows}
              isLoading={overview.isLoading}
              filters={overview.filters}
              onFiltersChange={(patch) =>
                overview.setFilters((prev) => ({ ...prev, ...patch }))
              }
              availableClasses={overview.availableClasses}
            />
          </TabsContent>

          <TabsContent value="students-ending">
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

          <TabsContent value="classes-ending">
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

          <TabsContent value="cho-bu-bao-luu">
            <ChoBuBaoLuuTab data={choBuBaoLuu.data} isLoading={choBuBaoLuu.isLoading} />
          </TabsContent>

          <TabsContent value="bang-diem">
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

          <TabsContent value="bai-tap-ve-nha">
            <AssignmentsTab enabled={activeTab === "bai-tap-ve-nha"} />
          </TabsContent>

          <TabsContent value="nhan-xet-hoc-vien">
            <StudentReviewsTab enabled={activeTab === "nhan-xet-hoc-vien"} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
