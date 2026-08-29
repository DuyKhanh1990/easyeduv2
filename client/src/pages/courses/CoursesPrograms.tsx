import { useState, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { RichEditor } from "@/components/ui/rich-editor";
import { RichContentRenderer as SharedRichRenderer, RichContentPreview } from "@/components/ui/rich-content-renderer";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { createPortal } from "react-dom";
import * as mammoth from "mammoth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BookOpen, 
  GraduationCap, 
  Library, 
  Plus, 
  Search, 
  MoreVertical,
  Layers,
  DollarSign,
  Clock,
  Loader2,
  FileText,
  Paperclip,
  Upload,
  Eye,
  Edit2,
  Trash2,
  Link2,
  FileImage,
  FileSpreadsheet,
  Film,
  Music,
  File,
  FileType2,
  Download,
  X,
  ImageIcon,
  LinkIcon
  ,History as HistoryIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  insertCourseSchema, 
  insertCourseFeePackageSchema, 
  insertCourseProgramSchema,
  insertCourseProgramContentSchema,
  type Course, 
  type CourseFeePackage, 
  type Location,
  type CourseProgram,
  type CourseProgramContent
} from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMyPermissions, type MyPermissionsResult } from "@/hooks/use-my-permissions";
import { useCanDownloadFiles, resolveCanDownload } from "@/hooks/use-can-download-files";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileViewer } from "@/components/ui/file-viewer";
import { CoursesHistoryTab } from "./CoursesHistoryTab";

const COURSES_HREF = "/courses";
const COURSES_TABS = [
  { value: "courses", label: "Khoá học", icon: BookOpen },
  { value: "programs", label: "Chương trình học", icon: GraduationCap },
  { value: "library", label: "Thư viện nội dung", icon: Library },
];
const HISTORY_TAB = { value: "history", label: "Lịch sử" };

type TabPerm = { canAdd: boolean; canEdit: boolean; canDelete: boolean };

function buildTabPerm(data: MyPermissionsResult | null | undefined, tabValue: string): TabPerm {
  if (!data) return { canAdd: false, canEdit: false, canDelete: false };
  if (data.isSuperAdmin) return { canAdd: true, canEdit: true, canDelete: true };
  const key = `${COURSES_HREF}#${tabValue}`;
  const p = data.permissions[key];
  if (!p) return { canAdd: false, canEdit: false, canDelete: false };
  return { canAdd: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
}

function canViewTab(data: MyPermissionsResult | null | undefined, tabValue: string): boolean {
  if (!data) return true;
  if (data.isSuperAdmin) return true;
  const key = `${COURSES_HREF}#${tabValue}`;
  const p = data.permissions[key];
  if (!p) return false;
  return p.canView || p.canViewAll;
}

export default function CoursesPrograms() {
  const { isSubTabVisible } = useSidebarVisibility();
  const { data: myPerms } = useMyPermissions();
  const visibleTabs = COURSES_TABS.filter(t => isSubTabVisible(COURSES_HREF, t.value) && canViewTab(myPerms, t.value));
  const canViewHistory = visibleTabs.length > 0 || !!myPerms?.isSuperAdmin;
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("tab") || visibleTabs[0]?.value || "courses";
    }
    return visibleTabs[0]?.value || "courses";
  });

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setLocation(`/courses?tab=${value}`);
  };

  const coursesPerm = buildTabPerm(myPerms, "courses");
  const programsPerm = buildTabPerm(myPerms, "programs");
  const libraryPerm = buildTabPerm(myPerms, "library");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [editingPackage, setEditingPackage] = useState<CourseFeePackage | null>(null);
  const [deletingPackage, setDeletingPackage] = useState<CourseFeePackage | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
  const [editingProgram, setEditingProgram] = useState<CourseProgram | null>(null);
  const [deletingProgram, setDeletingProgram] = useState<CourseProgram | null>(null);
  const { toast } = useToast();

  const { data: deletingCourseFeePackages = [] } = useQuery<CourseFeePackage[]>({
    queryKey: ["/api/courses", deletingCourse?.id, "fee-packages"],
    enabled: !!deletingCourse,
  });

  const deleteCoursesMutation = useMutation({
    mutationFn: async (course: Course) => {
      await apiRequest("DELETE", `/api/courses/${course.id}`);
      return course;
    },
    onSuccess: (_, course) => {
      queryClient.setQueryData<Course[]>(["/api/courses"], (old = []) =>
        old.filter(c => c.id !== course.id)
      );
      queryClient.removeQueries({ queryKey: ["/api/courses", course.id, "fee-packages"] });
      toast({ title: "Đã xoá", description: "Khoá học đã được xoá thành công" });
      setDeletingCourse(null);
      setSelectedCourseId(prev => prev === course.id ? null : prev);
    },
    onError: () => {
      toast({ title: "Lỗi", description: "Không thể xoá khoá học", variant: "destructive" });
    }
  });

  const deleteProgramMutation = useMutation({
    mutationFn: async (program: CourseProgram) => {
      await apiRequest("DELETE", `/api/course-programs/${program.id}`);
      return program;
    },
    onSuccess: (_, program) => {
      queryClient.setQueryData<CourseProgram[]>(["/api/course-programs"], (old = []) =>
        old.filter(p => p.id !== program.id)
      );
      toast({ title: "Đã xoá", description: "Chương trình học đã được xoá thành công" });
      setDeletingProgram(null);
      setSelectedProgramId(prev => prev === program.id ? null : prev);
    },
    onError: () => {
      toast({ title: "Lỗi", description: "Không thể xoá chương trình học", variant: "destructive" });
    }
  });

  const deletePackageMutation = useMutation({
    mutationFn: async (pkg: CourseFeePackage) => {
      await apiRequest("DELETE", `/api/courses/${pkg.courseId}/fee-packages/${pkg.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", selectedCourseId, "fee-packages"] });
      toast({ title: "Đã xoá", description: "Gói học phí đã được xoá thành công" });
      setDeletingPackage(null);
    },
    onError: () => {
      toast({ title: "Lỗi", description: "Không thể xoá gói học phí", variant: "destructive" });
    }
  });

  const { data: courses = [], isLoading: isLoadingCourses } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
  });

  const { data: feePackages = [], isLoading: isLoadingPackages } = useQuery<CourseFeePackage[]>({
    queryKey: ["/api/courses", selectedCourseId, "fee-packages"],
    enabled: !!selectedCourseId,
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: programs = [], isLoading: isLoadingPrograms } = useQuery<CourseProgram[]>({
    queryKey: ["/api/course-programs"],
    enabled: activeTab === "programs",
  });

  const { data: programContents = [], isLoading: isLoadingContents } = useQuery<CourseProgramContent[]>({
    queryKey: ["/api/course-programs", selectedProgramId, "contents"],
    enabled: !!selectedProgramId && activeTab === "programs",
  });

  useEffect(() => {
    if (courses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  useEffect(() => {
    if (programs.length > 0 && !selectedProgramId) {
      setSelectedProgramId(programs[0].id);
    }
  }, [programs, selectedProgramId]);

  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const selectedProgram = programs.find(p => p.id === selectedProgramId);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">

        <Tabs value={activeTab} className="w-full flex-1 flex flex-col overflow-hidden min-h-0" onValueChange={handleTabChange}>
          <div className="flex flex-wrap gap-2 mb-3 shrink-0">
            {visibleTabs.map(t => (
              <button
                key={t.value}
                onClick={() => handleTabChange(t.value)}
                className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", activeTab === t.value ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
            {canViewHistory && (
              <button
                key={HISTORY_TAB.value}
                onClick={() => handleTabChange(HISTORY_TAB.value)}
                className={cn("px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5", activeTab === HISTORY_TAB.value ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border text-foreground hover:bg-muted/50")}
              >
                <HistoryIcon className="h-3.5 w-3.5" />
                {HISTORY_TAB.label}
              </button>
            )}
          </div>

          {canViewTab(myPerms, "courses") && <TabsContent value="courses" className="mt-0 flex-1 overflow-hidden min-h-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
              {/* Nửa trái: Danh sách khoá học */}
              <Card className="lg:col-span-5 flex flex-col border-none shadow-xl shadow-black/5 bg-white overflow-hidden">
                <CardHeader className="border-b border-border/50 py-4 px-6 flex flex-row items-center justify-between bg-white sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BookOpen className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-lg font-display">Khoá học</CardTitle>
                  </div>
                  {coursesPerm.canAdd && <CourseDialog locations={locations} />}
                </CardHeader>
                <div className="p-4 bg-muted/20 border-b border-border/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Tìm kiếm khoá học..." className="pl-9 bg-background border-none shadow-sm h-10" />
                  </div>
                </div>
                <CardContent className="flex-1 overflow-y-auto p-2">
                  {isLoadingCourses ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {courses.map((course) => {
                        const courseLocation = locations.find(l => l.id === course.locationId);
                        return (
                          <div
                            key={course.id}
                            onClick={() => setSelectedCourseId(course.id)}
                            className={cn(
                              "group p-4 rounded-xl cursor-pointer transition-all duration-200 border border-transparent",
                              selectedCourseId === course.id
                                ? "bg-primary/5 border-primary/20 shadow-sm"
                                : "hover:bg-muted/50"
                            )}
                            data-testid={`course-item-${course.id}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wider">
                                    {course.code}
                                  </span>
                                  <h4 className={cn(
                                    "font-semibold text-sm transition-colors",
                                    selectedCourseId === course.id ? "text-primary" : "text-foreground"
                                  )}>
                                    {course.name}
                                  </h4>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Layers className="h-3 w-3" />
                                    {courseLocation?.name || "N/A"}
                                  </span>
                                </div>
                              </div>
                              {(coursesPerm.canEdit || coursesPerm.canDelete) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {coursesPerm.canEdit && (
                                    <DropdownMenuItem className="cursor-pointer flex items-center gap-2" onClick={(e) => { e.stopPropagation(); setEditingCourse(course); }}>
                                      <Edit2 className="h-4 w-4" /> Sửa
                                    </DropdownMenuItem>
                                  )}
                                  {coursesPerm.canDelete && (
                                    <DropdownMenuItem className="cursor-pointer flex items-center gap-2 text-destructive focus:text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingCourse(course); }}>
                                      <Trash2 className="h-4 w-4" /> Xoá
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Nửa phải: Gói học phí */}
              <Card className="lg:col-span-7 flex flex-col border-none shadow-xl shadow-black/5 bg-white overflow-hidden">
                <CardHeader className="border-b border-border/50 py-4 px-6 flex flex-row items-center justify-between bg-white sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                    </div>
                    <CardTitle className="text-lg font-display">Gói học phí: {selectedCourse?.name}</CardTitle>
                  </div>
                  {coursesPerm.canAdd && <FeePackageDialog courseId={selectedCourseId} />}
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-4">
                  {isLoadingPackages ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : feePackages.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {feePackages.map((pkg) => (
                        <Card key={pkg.id} className="border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                          <CardContent className="p-3 space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2 min-w-0">
                                <h5 className="font-semibold text-sm text-foreground truncate">{pkg.name}</h5>
                                <span className={cn(
                                  "text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded shrink-0",
                                  pkg.type === "buổi" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                                )}>
                                  {pkg.type}
                                </span>
                              </div>
                              {(coursesPerm.canEdit || coursesPerm.canDelete) && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                                      <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {coursesPerm.canEdit && (
                                      <DropdownMenuItem className="cursor-pointer flex items-center gap-2" onClick={() => setEditingPackage(pkg)}>
                                        <Edit2 className="h-4 w-4" /> Sửa
                                      </DropdownMenuItem>
                                    )}
                                    {coursesPerm.canDelete && (
                                      <DropdownMenuItem className="cursor-pointer flex items-center gap-2 text-destructive focus:text-destructive" onClick={() => setDeletingPackage(pkg)}>
                                        <Trash2 className="h-4 w-4" /> Xoá
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4 text-xs">
                              <div>
                                <span className="text-muted-foreground">Học phí: </span>
                                <span className="font-semibold text-foreground">
                                  {new Intl.NumberFormat('vi-VN').format(Number(pkg.fee))}đ
                                  <span className="text-muted-foreground font-normal">/{pkg.type}</span>
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <span className="font-semibold text-foreground">{pkg.sessions}</span>
                                <span className="text-muted-foreground">tiết</span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                              <p className="text-xs text-muted-foreground">Thành tiền</p>
                              <p className="text-sm font-bold text-primary">
                                {new Intl.NumberFormat('vi-VN').format(Number(pkg.totalAmount))}đ
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-muted/5 rounded-2xl border-2 border-dashed border-border/50">
                      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                        <DollarSign className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                      <h3 className="text-lg font-display font-semibold text-foreground">Chưa có gói học phí</h3>
                      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                        Hãy thêm các gói học phí (theo buổi hoặc theo khoá) cho khoá học này.
                      </p>
                      {coursesPerm.canAdd && (
                        <FeePackageDialog courseId={selectedCourseId} trigger={
                          <Button variant="outline" className="mt-6 gap-2" disabled={!selectedCourseId}>
                            <Plus className="h-4 w-4" />
                            Thêm gói đầu tiên
                          </Button>
                        } />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>}

          {canViewTab(myPerms, "programs") && <TabsContent value="programs" className="mt-0 flex-1 overflow-hidden min-h-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
              {/* Nửa trái: Danh sách Chương trình học */}
              <Card className="lg:col-span-4 flex flex-col border-none shadow-xl shadow-black/5 bg-white overflow-hidden">
                <CardHeader className="border-b border-border/50 py-4 px-6 flex flex-row items-center justify-between bg-white sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <GraduationCap className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-lg font-display">Chương trình học</CardTitle>
                  </div>
                  {programsPerm.canAdd && <ProgramDialog locations={locations} />}
                </CardHeader>
                <div className="p-4 bg-muted/20 border-b border-border/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Tìm kiếm chương trình..." className="pl-9 bg-background border-none shadow-sm h-10" />
                  </div>
                </div>
                <CardContent className="flex-1 overflow-y-auto p-2">
                  {isLoadingPrograms ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {programs.map((program) => (
                        <div
                          key={program.id}
                          onClick={() => setSelectedProgramId(program.id)}
                          className={cn(
                            "group p-4 rounded-xl cursor-pointer transition-all duration-200 border border-transparent",
                            selectedProgramId === program.id
                              ? "bg-primary/5 border-primary/20 shadow-sm"
                              : "hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wider">
                                  {program.code}
                                </span>
                                <h4 className={cn(
                                  "font-semibold text-sm transition-colors",
                                  selectedProgramId === program.id ? "text-primary" : "text-foreground"
                                )}>
                                  {program.name}
                                </h4>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {program.sessions} buổi
                                </span>
                              </div>
                            </div>
                            {(programsPerm.canEdit || programsPerm.canDelete) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {programsPerm.canEdit && (
                                  <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditingProgram(program); }}>
                                    <Edit2 className="h-4 w-4 mr-2" />
                                    Sửa chương trình
                                  </DropdownMenuItem>
                                )}
                                {programsPerm.canDelete && (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={e => { e.stopPropagation(); setDeletingProgram(program); }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Xoá chương trình
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Nửa phải: Nội dung chi tiết */}
              <Card className="lg:col-span-8 flex flex-col border-none shadow-xl shadow-black/5 bg-white overflow-hidden">
                <CardHeader className="border-b border-border/50 py-4 px-6 flex flex-row items-center justify-between bg-white sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-orange-600" />
                    </div>
                    <CardTitle className="text-lg font-display">Nội dung: {selectedProgram?.name}</CardTitle>
                  </div>
                  {programsPerm.canAdd && (
                  <div className="flex items-center gap-2">
                    <UploadContentDialog program={selectedProgram} />
                    <AssignContentDialog program={selectedProgram} />
                    <ProgramContentDialog program={selectedProgram} />
                  </div>
                  )}
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-0">
                  {isLoadingContents ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : selectedProgram ? (
                    <div className="divide-y divide-border/50">
                      {Array.from({ length: Number(selectedProgram.sessions) }).map((_, i) => {
                        const sessionNum = i + 1;
                        const contents = programContents.filter(c => Number(c.sessionNumber) === sessionNum);
                        
                        return (
                          <div key={sessionNum} className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <h5 className="font-semibold text-sm flex items-center gap-1.5">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                                  {sessionNum}
                                </span>
                                Buổi {sessionNum}
                              </h5>
                              {programsPerm.canAdd && (
                              <ProgramContentDialog 
                                program={selectedProgram} 
                                defaultSession={sessionNum}
                                trigger={
                                  <Button variant="outline" size="sm" className="gap-1 h-6 text-xs px-2 py-0">
                                    <Plus className="h-3 w-3" />
                                    Thêm nội dung
                                  </Button>
                                }
                              />
                              )}
                            </div>

                            {contents.length > 0 ? (
                              <div className="grid grid-cols-1 gap-1.5 ml-7">
                                {contents.map((content) => (
                                  <Card key={content.id} className="border border-border/50 shadow-sm">
                                    <CardContent className="p-2.5">
                                      <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <Badge variant="secondary" className="text-[9px] uppercase font-bold shrink-0 px-1.5 py-0">
                                            {content.type}
                                          </Badge>
                                          <h6 className="font-medium text-sm truncate">{content.title}</h6>
                                          {content.attachments && content.attachments.length > 0 && (
                                            <div className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
                                              <span className="font-medium">{content.attachments.length}</span>
                                              <Paperclip className="h-3 w-3" />
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <ViewContentDialog content={content} />
                                          {programsPerm.canEdit && (
                                          <ProgramContentDialog 
                                            program={selectedProgram} 
                                            content={content}
                                            trigger={
                                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary">
                                                <Edit2 className="h-3.5 w-3.5" />
                                              </Button>
                                            }
                                          />
                                          )}
                                          {programsPerm.canDelete && (
                                          <DeleteContentButton content={content} programId={selectedProgram?.id} />
                                          )}
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground ml-10 italic">Chưa có nội dung cho buổi này</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12">
                      <GraduationCap className="w-16 h-16 text-muted-foreground/20 mb-4" />
                      <h3 className="text-lg font-semibold">Chọn chương trình học</h3>
                      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                        Chọn một chương trình bên trái để xem và quản lý nội dung chi tiết từng buổi học.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>}

          {canViewTab(myPerms, "library") && <TabsContent value="library" className="mt-0 flex-1 overflow-hidden min-h-0">
            <ContentLibraryTab perm={libraryPerm} isActive={activeTab === "library"} />
          </TabsContent>}
          {canViewHistory && <TabsContent value="history" className="mt-0 flex-1 overflow-hidden min-h-0">
            <CoursesHistoryTab />
          </TabsContent>}
        </Tabs>
      </div>

      {/* Edit course dialog */}
      {editingCourse && (
        <CourseDialog
          locations={locations}
          editCourse={editingCourse}
          open={true}
          onOpenChange={(open) => { if (!open) setEditingCourse(null); }}
        />
      )}

      {/* Delete course confirmation */}
      <AlertDialog open={!!deletingCourse} onOpenChange={(open) => { if (!open) setDeletingCourse(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá khoá học</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Bạn có chắc muốn xoá khoá học <strong>{deletingCourse?.name}</strong>? Hành động này không thể hoàn tác.</p>
                {deletingCourseFeePackages.length > 0 && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <p className="font-semibold mb-1">⚠ Cảnh báo: Khoá học này đang có {deletingCourseFeePackages.length} gói học phí:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-destructive/80">
                      {deletingCourseFeePackages.map(pkg => (
                        <li key={pkg.id}>{pkg.name} ({pkg.type} — {new Intl.NumberFormat('vi-VN').format(Number(pkg.fee))}đ)</li>
                      ))}
                    </ul>
                    <p className="mt-2 font-medium">Tất cả gói học phí trên cũng sẽ bị xoá.</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingCourse && deleteCoursesMutation.mutate(deletingCourse)}
              disabled={deleteCoursesMutation.isPending}
            >
              {deleteCoursesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete program confirmation */}
      <AlertDialog open={!!deletingProgram} onOpenChange={(open) => { if (!open) setDeletingProgram(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá chương trình học</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Bạn có chắc muốn xoá chương trình <strong>{deletingProgram?.name}</strong>? Hành động này không thể hoàn tác.</p>
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <p>⚠ Tất cả nội dung buổi học trong chương trình này cũng sẽ bị xoá.</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingProgram && deleteProgramMutation.mutate(deletingProgram)}
              disabled={deleteProgramMutation.isPending}
            >
              {deleteProgramMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit program dialog */}
      {editingProgram && (
        <ProgramDialog
          locations={locations}
          editProgram={editingProgram}
          open={true}
          onOpenChange={(open) => { if (!open) setEditingProgram(null); }}
        />
      )}

      {/* Edit fee package dialog */}
      {editingPackage && (
        <FeePackageDialog
          courseId={editingPackage.courseId}
          editPackage={editingPackage}
          open={true}
          onOpenChange={(open) => { if (!open) setEditingPackage(null); }}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingPackage} onOpenChange={(open) => { if (!open) setDeletingPackage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá gói học phí</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xoá gói <strong>{deletingPackage?.name}</strong>? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingPackage && deletePackageMutation.mutate(deletingPackage)}
              disabled={deletePackageMutation.isPending}
            >
              {deletePackageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

// ==========================================
// CONTENT LIBRARY TAB
// ==========================================

type LibraryContent = CourseProgramContent & { programName?: string | null; createdByUsername?: string | null };

function ContentLibraryTab({ perm, isActive }: { perm: TabPerm; isActive: boolean }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Reset page when search changes
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };

  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(search ? { search } : {}),
  }).toString();

  const { data, isLoading } = useQuery<{ items: LibraryContent[]; total: number }>({
    queryKey: ["/api/course-program-contents", page, pageSize, search],
    queryFn: async () => {
      const res = await fetch(`/api/course-program-contents?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Không thể tải thư viện nội dung");
      return res.json();
    },
    enabled: isActive,
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const { data: programs = [] } = useQuery<CourseProgram[]>({
    queryKey: ["/api/course-programs"],
    enabled: isActive,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/course-program-contents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-program-contents"] });
      toast({ title: "Đã xoá nội dung" });
    },
    onError: () => toast({ title: "Lỗi khi xoá", variant: "destructive" }),
  });

  const formatDate = (dt: string | Date) => {
    const d = new Date(dt);
    const days = ["CN","T2","T3","T4","T5","T6","T7"];
    return `${days[d.getDay()]} ${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getFullYear()}`;
  };

  const contentPreview = (text: string | null | undefined) => {
    if (!text) return "—";
    const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return plain.length > 60 ? plain.slice(0, 60) + "..." : plain || "—";
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card className="border-none shadow-lg shadow-black/5 bg-white flex flex-col h-full overflow-hidden">
      <CardHeader className="pb-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-xl font-display flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            Thư viện nội dung
          </CardTitle>
          {perm.canAdd && (
            <div className="flex items-center gap-2">
              <UploadContentDialog programs={programs} />
              <LibraryContentDialog programs={programs} />
            </div>
          )}
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm tiêu đề, chương trình, loại..."
            className="pl-9"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            data-testid="input-library-search"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 flex-1">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground flex-1">
            <Library className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm">{search ? "Không tìm thấy nội dung phù hợp" : "Chưa có nội dung nào trong thư viện"}</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold">Tiêu đề</TableHead>
                  <TableHead className="font-semibold w-28">Loại</TableHead>
                  <TableHead className="font-semibold">Chương trình học</TableHead>
                  <TableHead className="font-semibold">Nội dung</TableHead>
                  <TableHead className="font-semibold w-28">Tạo bởi</TableHead>
                  <TableHead className="font-semibold w-36">Ngày tạo</TableHead>
                  <TableHead className="font-semibold w-24 text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((content) => (
                  <TableRow key={content.id} className="hover:bg-muted/20" data-testid={`row-library-${content.id}`}>
                    <TableCell className="font-medium max-w-[200px]">
                      <span className="line-clamp-2">{content.title}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] uppercase font-bold whitespace-nowrap">
                        {content.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {content.programName ? (
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                          {content.programName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs italic">Chưa gán</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px]">
                      <span className="line-clamp-2">{contentPreview(content.content)}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {content.createdByUsername || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(content.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <LibraryViewDialog content={content} />
                        {perm.canEdit && (
                        <LibraryContentDialog programs={programs} content={content} trigger={
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" data-testid={`button-edit-library-${content.id}`}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        } />
                        )}
                        {perm.canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          data-testid={`button-delete-library-${content.id}`}
                          onClick={() => {
                            if (confirm(`Xoá nội dung "${content.title}"?`)) {
                              deleteMutation.mutate(content.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination footer */}
        {!isLoading && total > 0 && (
          <div className="shrink-0 flex items-center justify-between text-sm text-muted-foreground px-4 py-2 border-t bg-muted/10">
            <div className="flex items-center gap-2">
              <span>{total} nội dung</span>
              <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[20, 30, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n} / trang</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
              <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</Button>
              <span className="px-2 text-xs">Trang {page} / {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</Button>
              <Button variant="outline" size="icon" className="h-7 w-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LibraryViewDialog({ content }: { content: LibraryContent }) {
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  const roleCanDownload = useCanDownloadFiles();
  return (
    <>
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" data-testid={`button-view-library-${content.id}`}>
          <Eye className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-[95vw] max-h-[95vh] h-[95vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary" className="text-[10px] uppercase font-bold">{content.type}</Badge>
            {content.programName && (
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{content.programName}</span>
            )}
          </div>
          <DialogTitle className="text-xl font-bold">{content.title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          <div className="bg-muted/30 rounded-xl p-6 min-h-[120px]">
            {content.content ? (
              <RichContentRenderer text={content.content} />
            ) : (
              <span className="text-sm text-muted-foreground">Không có nội dung chi tiết</span>
            )}
          </div>
          {content.attachments && content.attachments.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-primary">File đính kèm</p>
              <div className="grid grid-cols-6 gap-2">
                {content.attachments.map((att, idx) => {
                  const { name, url } = parseAttachment(att);
                  const { icon, color } = getFileTypeInfo(name);
                  const canView = !!url;
                  return (
                    <div
                      key={idx}
                      title={name}
                      className={cn(
                        "group relative flex flex-col items-center gap-1.5 px-1.5 py-3 rounded-lg bg-background border border-border transition-colors text-center overflow-hidden",
                        canView ? "cursor-pointer hover:border-primary/50" : "opacity-60"
                      )}
                      onClick={() => {
                        if (canView && url) {
                          setViewerFile({ url, name });
                        }
                      }}
                    >
                      <div className={cn("flex items-center justify-center w-9 h-9 rounded-lg shrink-0", color)}>{icon}</div>
                      <span className="text-[10px] text-foreground w-full truncate leading-snug px-0.5">{name}</span>
                      {canView && (
                        <div className="absolute inset-0 rounded-lg bg-black/50 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                          <Eye className="h-5 w-5 text-white" />
                          <span className="text-[10px] text-white font-semibold">Xem</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogTrigger asChild>
            <Button variant="outline">Đóng</Button>
          </DialogTrigger>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <FileViewer
      open={!!viewerFile}
      onClose={() => setViewerFile(null)}
      url={viewerFile?.url ?? ""}
      name={viewerFile?.name ?? ""}
      canDownload={resolveCanDownload(content.allowDownload, roleCanDownload)}
    />
    </>
  );
}

function LibraryContentDialog({
  programs,
  content,
  trigger,
}: {
  programs: CourseProgram[];
  content?: LibraryContent;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const LIB_MAX_FILE_SIZE_MB = 100;

  const form = useForm({
    resolver: zodResolver(insertCourseProgramContentSchema),
    defaultValues: content ? {
      title: content.title,
      type: content.type,
      content: content.content || "",
      programId: content.programId || null,
      sessionNumber: null as number | null,
      attachments: content.attachments || [] as string[],
      createdBy: content.createdBy || null,
      allowDownload: content.allowDownload ?? null,
    } : {
      title: "",
      type: "Bài học",
      content: "",
      programId: null as string | null,
      sessionNumber: null as number | null,
      attachments: [] as string[],
      createdBy: null as string | null,
      allowDownload: null as boolean | null,
    }
  });

  useEffect(() => {
    if (open && content) {
      form.reset({
        title: content.title,
        type: content.type,
        content: content.content || "",
        programId: content.programId || null,
        sessionNumber: null,
        attachments: content.attachments || [],
        createdBy: content.createdBy || null,
        allowDownload: content.allowDownload ?? null,
      });
    } else if (open && !content) {
      form.reset({ title: "", type: "Bài học", content: "", programId: null, sessionNumber: null, attachments: [], createdBy: null, allowDownload: null });
    }
  }, [open, content, form]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = { ...data, programId: data.programId || null, sessionNumber: data.sessionNumber || null };
      if (content) {
        const res = await apiRequest("PATCH", `/api/course-program-contents/${content.id}`, payload);
        return res.json();
      }
      const res = await apiRequest("POST", `/api/course-program-contents`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-program-contents"] });
      if (content?.programId) {
        queryClient.invalidateQueries({ queryKey: ["/api/course-programs", content.programId, "contents"] });
      }
      toast({ title: "Thành công", description: content ? "Đã cập nhật nội dung" : "Đã thêm nội dung vào thư viện" });
      setOpen(false);
    },
    onError: () => toast({ title: "Lỗi", description: "Không thể lưu nội dung", variant: "destructive" }),
  });

  const libUploadFiles = async (files: File[]): Promise<Array<{ name: string; url: string }>> => {
    const formData = new FormData();
    files.forEach(f => formData.append("files", f));
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.files;
  };


  const libHandleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const oversized = files.filter(f => f.size > LIB_MAX_FILE_SIZE_MB * 1024 * 1024);
    if (oversized.length > 0) {
      toast({ title: "File quá lớn", description: `Tối đa ${LIB_MAX_FILE_SIZE_MB}MB/file`, variant: "destructive" });
      e.target.value = "";
      return;
    }
    setIsUploading(true);
    try {
      const uploaded = await libUploadFiles(files);
      const current = form.getValues("attachments") || [];
      form.setValue("attachments", [...current, ...uploaded.map(f => `${f.name}||${f.url}`)]);
    } catch {
      toast({ title: "Lỗi upload", description: "Không thể tải file lên", variant: "destructive" });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const libHandleRemoveAttachment = (idx: number) => {
    const current = form.getValues("attachments") || [];
    form.setValue("attachments", current.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="gap-2" data-testid="button-add-library-content">
            <Plus className="h-4 w-4" />
            Thêm mới
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[90vw] max-w-[90vw] max-h-[90vh] flex flex-col">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="flex flex-col flex-1 min-h-0">
            <DialogHeader className="shrink-0 flex flex-row items-center justify-between space-y-0 pb-2 border-b">
              <DialogTitle className="text-xl font-display">
                {content ? "Chỉnh sửa nội dung" : "Thêm nội dung thư viện"}
              </DialogTitle>
              <Button type="submit" size="sm" className="ml-4 shrink-0" disabled={mutation.isPending || isUploading} data-testid="button-save-library-content">
                {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {content ? "Lưu thay đổi" : "Thêm vào thư viện"}
              </Button>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loại nội dung *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "Bài học"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-library-type">
                            <SelectValue placeholder="Chọn loại" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Bài học">Bài học</SelectItem>
                          <SelectItem value="Bài tập về nhà">Bài tập về nhà</SelectItem>
                          <SelectItem value="Giáo trình">Giáo trình</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="programId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chương trình học</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-library-program">
                            <SelectValue placeholder="Chưa gán" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Chưa gán</SelectItem>
                          {programs.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên nội dung *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nhập tên nội dung" {...field} data-testid="input-library-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mô tả nội dung</FormLabel>
                    <RichEditor
                      value={field.value || ""}
                      onChange={field.onChange}
                      placeholder="Nhập mô tả chi tiết, hoặc paste ảnh trực tiếp vào đây..."
                      data-testid="textarea-library-content"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="attachments"
                render={({ field }) => (
                  <FormItem>
                    <div className="space-y-2">
                      <FormLabel>Đính kèm file</FormLabel>
                      {(field.value || []).length > 0 && (
                        <div className="grid grid-cols-6 gap-2">
                          {(field.value || []).map((att, idx) => {
                            const { name, url } = parseAttachment(att);
                            const { icon, color } = getFileTypeInfo(name);
                            return (
                              <div key={idx} className="group relative flex flex-col items-center gap-1.5 px-1.5 py-2 rounded-lg bg-muted/30 border border-border text-center">
                                <div className={cn("flex items-center justify-center w-8 h-8 rounded-md shrink-0", color)}>{icon}</div>
                                <span className="text-[10px] text-foreground w-full truncate px-0.5">{name}</span>
                                <button type="button" className="absolute top-1 right-1 h-4 w-4 rounded-full bg-destructive/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => libHandleRemoveAttachment(idx)}>
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div>
                        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={libHandleFileChange} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp3,.mp4,.mov,.avi,.wav,.ogg,.aac,.mkv,.webm,.zip,.rar,.txt,.csv" />
                        <Button type="button" variant="outline" size="sm" className="gap-2 border-dashed" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                          <Plus className="h-3.5 w-3.5" />
                          Thêm file
                        </Button>
                        <p className="text-[10px] text-muted-foreground mt-1">Ảnh, Word, Excel, PowerPoint, PDF, Video, MP3... | Tối đa {LIB_MAX_FILE_SIZE_MB}MB/file</p>
                      </div>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowDownload"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-3 py-1">
                      <Checkbox
                        id="lib-allow-download"
                        checked={field.value === true}
                        onCheckedChange={(checked) => field.onChange(checked === true ? true : (field.value === false ? false : null))}
                        className="w-4 h-4"
                      />
                      <label htmlFor="lib-allow-download" className="text-sm font-medium cursor-pointer select-none">
                        Cho phép tải file đính kèm
                      </label>
                      <span className="text-xs text-muted-foreground">(để trống = theo mặc định vai trò)</span>
                    </div>
                    {field.value !== null && field.value !== undefined && (
                      <button type="button" onClick={() => field.onChange(null)} className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground underline ml-7">
                        Xoá ghi đè, dùng mặc định vai trò
                      </button>
                    )}
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ProgramDialog({
  locations,
  editProgram,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  locations: Location[];
  editProgram?: CourseProgram;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isEdit = !!editProgram;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(v);
    else setInternalOpen(v);
  };
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertCourseProgramSchema),
    defaultValues: {
      code: editProgram?.code ?? "",
      name: editProgram?.name ?? "",
      locationIds: (editProgram?.locationIds ?? []) as string[],
      sessions: editProgram ? Number(editProgram.sessions) : 0,
      note: editProgram?.note ?? ""
    }
  });

  useEffect(() => {
    if (open && editProgram) {
      form.reset({
        code: editProgram.code,
        name: editProgram.name,
        locationIds: (editProgram.locationIds ?? []) as string[],
        sessions: Number(editProgram.sessions),
        note: editProgram.note ?? ""
      });
    } else if (open && !editProgram) {
      form.reset({ code: "", name: "", locationIds: [], sessions: 0, note: "" });
    }
  }, [open, editProgram]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEdit && editProgram) {
        const res = await apiRequest("PUT", `/api/course-programs/${editProgram.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/course-programs", data);
      return res.json();
    },
    onSuccess: (updatedProgram) => {
      if (isEdit && updatedProgram?.id) {
        queryClient.setQueryData<CourseProgram[]>(["/api/course-programs"], (old = []) =>
          old.map(p => p.id === updatedProgram.id ? updatedProgram : p)
        );
      } else if (updatedProgram?.id) {
        queryClient.setQueryData<CourseProgram[]>(["/api/course-programs"], (old = []) =>
          [updatedProgram, ...(old || [])]
        );
      }
      toast({ title: "Thành công", description: isEdit ? "Đã cập nhật chương trình học" : "Đã lưu chương trình học mới" });
      setOpen(false);
      if (!isEdit) form.reset();
    },
    onError: (error: any) => {
      const msg = error?.message || "";
      if (msg.includes("duplicate key") || msg.includes("course_programs_code_unique")) {
        form.setError("code", { message: "Mã chương trình đã tồn tại, vui lòng chọn mã khác" });
      } else {
        toast({ title: "Lỗi", description: "Không thể lưu chương trình học. Vui lòng thử lại.", variant: "destructive" });
      }
    },
  });

  const trigger = !isEdit ? (
    <Button size="sm" className="gap-2 shadow-md shadow-primary/20">
      <Plus className="h-4 w-4" />
      Chương trình
    </Button>
  ) : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">{isEdit ? "Sửa Chương trình học" : "Thêm mới Chương trình học"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mã chương trình</FormLabel>
                    <FormControl>
                      <Input placeholder="VD: IELTS-F" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên chương trình</FormLabel>
                    <FormControl>
                      <Input placeholder="Nhập tên chương trình" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="locationIds"
              render={() => (
                <FormItem>
                  <FormLabel>Cơ sở (Multi select)</FormLabel>
                  <div className="grid grid-cols-2 gap-2 p-4 border rounded-lg">
                    {locations.map((loc) => (
                      <FormField
                        key={loc.id}
                        control={form.control}
                        name="locationIds"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(loc.id)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...field.value, loc.id])
                                    : field.onChange(field.value?.filter((v: string) => v !== loc.id));
                                }}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">{loc.name}</FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sessions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Số buổi</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ghi chú</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Nhập ghi chú" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isEdit ? "Cập nhật chương trình" : "Lưu chương trình"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteContentButton({ content, programId }: { content: CourseProgramContent, programId: string | undefined }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/course-program-contents/${content.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-programs", programId, "contents"] });
      toast({ title: "Thành công", description: "Đã xóa nội dung" });
    },
    onError: (error) => {
      toast({ title: "Lỗi", description: error.message, variant: "destructive" });
    }
  });

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className="h-8 w-8 text-muted-foreground hover:text-destructive"
      onClick={() => {
        if (confirm("Bạn có chắc chắn muốn xóa nội dung này?")) {
          mutation.mutate();
        }
      }}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}

function parseAttachment(att: string): { name: string; url: string | null } {
  if (att.includes("||")) {
    const sepIdx = att.indexOf("||");
    return { name: att.slice(0, sepIdx), url: att.slice(sepIdx + 2) };
  }
  return { name: att, url: null };
}

function getFileExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function getFileTypeInfo(filename: string): { icon: ReactNode; color: string } {
  const ext = getFileExt(filename);
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) {
    return { icon: <FileImage className="h-5 w-5" />, color: "text-pink-500 bg-pink-50 dark:bg-pink-950/30" };
  }
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return { icon: <FileSpreadsheet className="h-5 w-5" />, color: "text-green-600 bg-green-50 dark:bg-green-950/30" };
  }
  if (["ppt", "pptx"].includes(ext)) {
    return { icon: <FileType2 className="h-5 w-5" />, color: "text-orange-500 bg-orange-50 dark:bg-orange-950/30" };
  }
  if (["doc", "docx"].includes(ext)) {
    return { icon: <FileText className="h-5 w-5" />, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" };
  }
  if (ext === "pdf") {
    return { icon: <FileText className="h-5 w-5" />, color: "text-red-500 bg-red-50 dark:bg-red-950/30" };
  }
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
    return { icon: <Film className="h-5 w-5" />, color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" };
  }
  if (["mp3", "wav", "ogg", "aac"].includes(ext)) {
    return { icon: <Music className="h-5 w-5" />, color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" };
  }
  return { icon: <File className="h-5 w-5" />, color: "text-muted-foreground bg-muted" };
}

function getYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function isVideoUrl(url: string): boolean {
  const ext = getFileExt(url.split("?")[0]);
  return ["mp4", "mov", "avi", "mkv", "webm", "ogg"].includes(ext);
}

function isImageUrl(url: string): boolean {
  const ext = getFileExt(url.split("?")[0]);
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext);
}

function FileViewerModal({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const ext = getFileExt(name);
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext);
  const isVideo = ["mp4", "mov", "avi", "mkv", "webm", "ogg"].includes(ext);
  const isAudio = ["mp3", "wav", "ogg", "aac"].includes(ext);
  const isPdf = ext === "pdf";
  const isOffice = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext);

  const absoluteUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
  const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(absoluteUrl)}&embedded=true`;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="relative bg-background rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <span className="font-medium text-sm truncate max-w-[80%]">{name}</span>
          <div className="flex items-center gap-2">
            <a
              href={absoluteUrl}
              download={name}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              Tải về
            </a>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-0">
          {isImage && (
            <img src={absoluteUrl} alt={name} className="max-w-full max-h-full object-contain rounded" />
          )}
          {isVideo && (
            <video src={absoluteUrl} controls className="max-w-full max-h-full rounded" />
          )}
          {isAudio && (
            <div className="flex flex-col items-center gap-3">
              <Music className="h-16 w-16 text-indigo-400" />
              <audio src={absoluteUrl} controls className="w-72" />
            </div>
          )}
          {isPdf && (
            <iframe
              src={absoluteUrl}
              className="w-full rounded"
              style={{ height: "70vh" }}
              title={name}
            />
          )}
          {isOffice && (
            <iframe
              src={googleViewerUrl}
              className="w-full rounded"
              style={{ height: "70vh" }}
              title={name}
            />
          )}
          {!isImage && !isVideo && !isAudio && !isPdf && !isOffice && (
            <div className="flex flex-col items-center gap-4 text-center">
              <File className="h-16 w-16 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Không thể xem trực tiếp định dạng này</p>
              <a
                href={absoluteUrl}
                download={name}
                className="inline-flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90"
              >
                <Download className="h-4 w-4" />
                Tải về
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  , document.body);
}

function isUrlString(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/uploads/");
}

function resolveUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${window.location.origin}${url}`;
}

function RichContentRenderer({ text }: { text: string }) {
  return <SharedRichRenderer text={text} />;
}

function ViewContentDialog({ content }: { content: CourseProgramContent }) {
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  const roleCanDownload = useCanDownloadFiles();
  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
            <Eye className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="w-[95vw] max-w-[95vw] max-h-[95vh] h-[95vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                {content.type}
              </Badge>
              <span className="text-xs text-muted-foreground">Buổi {Number(content.sessionNumber)}</span>
            </div>
            <DialogTitle className="text-xl font-bold">{content.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
            <div className="bg-muted/30 rounded-xl p-6 min-h-[120px]">
              {content.content ? (
                <RichContentRenderer text={content.content} />
              ) : (
                <span className="text-sm text-muted-foreground">Không có nội dung chi tiết</span>
              )}
            </div>

            {content.attachments && content.attachments.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-primary">File đính kèm</p>
                <div className="grid grid-cols-6 gap-2">
                  {content.attachments.map((att, idx) => {
                    const { name, url } = parseAttachment(att);
                    const { icon, color } = getFileTypeInfo(name);
                    const canView = !!url;
                    return (
                      <div
                        key={idx}
                        title={name}
                        className={cn(
                          "group relative flex flex-col items-center gap-1.5 px-1.5 py-3 rounded-lg bg-background border border-border transition-colors text-center overflow-hidden",
                          canView ? "cursor-pointer hover:border-primary/50" : "opacity-60"
                        )}
                        onClick={() => {
                          if (canView && url) {
                            setViewerFile({ url, name });
                          }
                        }}
                      >
                        <div className={cn("flex items-center justify-center w-9 h-9 rounded-lg shrink-0", color)}>
                          {icon}
                        </div>
                        <span className="text-[10px] text-foreground w-full truncate leading-snug px-0.5">
                          {name}
                        </span>
                        {canView && (
                          <div className="absolute inset-0 rounded-lg bg-black/50 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                            <Eye className="h-5 w-5 text-white" />
                            <span className="text-[10px] text-white font-semibold">Xem</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogTrigger asChild>
              <Button variant="outline">Đóng</Button>
            </DialogTrigger>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FileViewer
        open={!!viewerFile}
        onClose={() => setViewerFile(null)}
        url={viewerFile?.url ?? ""}
        name={viewerFile?.name ?? ""}
        canDownload={resolveCanDownload(content.allowDownload, roleCanDownload)}
      />
    </>
  );
}

function AssignContentDialog({ program }: { program: CourseProgram | undefined }) {
  const [open, setOpen] = useState(false);
  const [sessionNumber, setSessionNumber] = useState<string>("1");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["Bài học"]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { toast } = useToast();

  const { data: libraryContents = [] } = useQuery<LibraryContent[]>({
    queryKey: ["/api/course-program-contents"],
    queryFn: async () => {
      const res = await fetch("/api/course-program-contents?pageSize=500", {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      return Array.isArray(json) ? json : (json.items ?? []);
    },
    enabled: open,
  });

  const TYPES = ["Bài học", "Bài tập về nhà", "Giáo trình"];

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const filtered = libraryContents.filter((c) => {
    const matchType = selectedTypes.length === 0 || selectedTypes.includes(c.type);
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const assignMutation = useMutation({
    mutationFn: async () => {
      const toAssign = libraryContents.filter((c) => selectedIds.includes(c.id));
      for (const item of toAssign) {
        await apiRequest("POST", `/api/course-programs/${program?.id}/contents`, {
          programId: program?.id,
          sessionNumber: Number(sessionNumber),
          title: item.title,
          type: item.type,
          content: item.content || "",
          attachments: item.attachments || [],
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-programs", program?.id, "contents"] });
      toast({ title: "Thành công", description: `Đã gán ${selectedIds.length} nội dung vào Buổi ${sessionNumber}` });
      setOpen(false);
      setSelectedIds([]);
      setSearch("");
    },
    onError: () => toast({ title: "Lỗi", description: "Không thể gán nội dung", variant: "destructive" }),
  });

  const handleOpen = (val: boolean) => {
    setOpen(val);
    if (val) {
      setSessionNumber("1");
      setSelectedTypes(["Bài học"]);
      setSearch("");
      setSelectedIds([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2" disabled={!program} data-testid="button-assign-content">
          <Link2 className="h-4 w-4" />
          Gán nội dung
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-display">Gán Nội dung</DialogTitle>
          <p className="text-sm text-muted-foreground">Chọn nội dung từ thư viện để gán vào buổi học</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
          {/* Session select */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Số buổi *</label>
            <Select value={sessionNumber} onValueChange={setSessionNumber}>
              <SelectTrigger data-testid="select-assign-session">
                <SelectValue placeholder="Chọn buổi" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: Number(program?.sessions || 0) }).map((_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>Buổi {i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type filter checkboxes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Loại *</label>
            <div className="flex items-center gap-5">
              {TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer text-sm select-none">
                  <Checkbox
                    checked={selectedTypes.includes(type)}
                    onCheckedChange={() => toggleType(type)}
                    data-testid={`checkbox-type-${type}`}
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>

          {/* Search + list */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tiêu đề (có thể chọn nhiều)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm theo tên nội dung..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-assign-search"
              />
            </div>
            <div className="border rounded-xl overflow-y-auto max-h-[260px] divide-y divide-border/50">
              {filtered.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {search ? "Không tìm thấy nội dung phù hợp" : "Không có nội dung trong thư viện"}
                </div>
              ) : (
                filtered.map((item) => (
                  <label
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors",
                      selectedIds.includes(item.id) && "bg-primary/5"
                    )}
                    data-testid={`item-assign-${item.id}`}
                  >
                    <Checkbox
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.type}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
            {selectedIds.length > 0 && (
              <p className="text-xs text-primary font-medium">Đã chọn {selectedIds.length} nội dung</p>
            )}
          </div>
        </div>

        <DialogFooter className="pt-3 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button
            onClick={() => assignMutation.mutate()}
            disabled={assignMutation.isPending || selectedIds.length === 0}
            data-testid="button-confirm-assign"
          >
            {assignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Gán nội dung {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadContentDialog({ program, programs }: { program?: CourseProgram | undefined; programs?: CourseProgram[] }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState<string>("Bài học");
  const [selectedProgramId, setSelectedProgramId] = useState<string>("__none__");
  const isLibraryMode = !program && Array.isArray(programs);
  const effectiveProgram = program ?? (programs ?? []).find((p) => p.id === selectedProgramId);

  const handleUpload = async () => {
    if (!file) return;
    if (!isLibraryMode && !program) return;
    setIsProcessing(true);
    
    try {
      let text = "";
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
        // Parse HTML to plain text, preserving bullet points as "• item"
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlResult.value, "text/html");
        const lines: string[] = [];

        // Trích text từ một node <p>, xử lý <br> thành xuống dòng thật
        const extractLinesFromP = (node: Element): string[] => {
          const result: string[] = [];
          let current = "";
          const walk = (n: Node) => {
            if (n.nodeType === Node.TEXT_NODE) {
              current += n.textContent ?? "";
            } else if (n.nodeType === Node.ELEMENT_NODE) {
              const el = n as Element;
              if (el.tagName === "BR") {
                const t = current.trim();
                if (t) result.push(t);
                current = "";
              } else {
                el.childNodes.forEach(walk);
              }
            }
          };
          node.childNodes.forEach(walk);
          const t = current.trim();
          if (t) result.push(t);
          return result;
        };

        const processNode = (node: Element) => {
          if (node.tagName === "LI") {
            const t = node.textContent?.trim();
            if (t) lines.push("• " + t);
          } else if (node.tagName === "P") {
            extractLinesFromP(node).forEach((l) => lines.push(l));
          } else {
            node.childNodes.forEach((child) => {
              if (child.nodeType === Node.ELEMENT_NODE) processNode(child as Element);
            });
          }
        };
        doc.body.childNodes.forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE) processNode(child as Element);
        });
        text = lines.join("\n");
      } else {
        text = await file.text();
      }

      // Regex để tìm các buổi: "Buổi X: Tiêu đề"
      const sessionsData: { sessionNumber: number, title: string, content: string }[] = [];
      
      // Tách theo dòng và xử lý
      const rawLines = text.split(/\r?\n/);
      let currentSession: any = null;

      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i].trim();
        if (!line) continue;

        // Tìm "Buổi X: Tiêu đề"
        const sessionMatch = line.match(/^Buổi\s+(\d+)[:\s]+(.*)/i);
        if (sessionMatch) {
          if (currentSession) {
            sessionsData.push(currentSession);
          }
          currentSession = {
            sessionNumber: parseInt(sessionMatch[1]),
            title: sessionMatch[2].trim() || `Buổi ${sessionMatch[1]}`,
            content: ""
          };
          continue;
        }

        // Bỏ qua dòng "Nội dung:" (tiêu đề phần)
        if (line.toLowerCase() === "nội dung:") {
          continue;
        }

        if (currentSession) {
          currentSession.content += (currentSession.content ? "\n" : "") + line;
        }
      }
      
      if (currentSession) {
        sessionsData.push(currentSession);
      }

      if (sessionsData.length === 0) {
        throw new Error("Không tìm thấy nội dung buổi học nào. Vui lòng đảm bảo file có định dạng: 'Buổi 1: Tên buổi học'.");
      }
      
      for (const session of sessionsData) {
        await apiRequest("POST", `/api/course-program-contents`, {
          programId: effectiveProgram?.id ?? null,
          sessionNumber: session.sessionNumber,
          title: session.title,
          type: selectedType,
          content: session.content
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/course-program-contents"] });
      if (effectiveProgram) {
        queryClient.invalidateQueries({ queryKey: ["/api/course-programs", effectiveProgram.id, "contents"] });
      }
      toast({ title: "Thành công", description: "Đã tải lên và xử lý nội dung thành công" });
      setIsOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể xử lý file. Vui lòng kiểm tra lại định dạng.";
      toast({ 
        title: "Lỗi", 
        description: message,
        variant: "destructive" 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) { setFile(null); setSelectedType("Bài học"); setSelectedProgramId("__none__"); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" size="sm" disabled={!isLibraryMode && !program}>
          <Upload className="h-4 w-4" />
          Tải lên
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Tải lên nội dung</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {isLibraryMode && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Chương trình học <span className="text-muted-foreground font-normal">(tuỳ chọn)</span></label>
              <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                <SelectTrigger>
                  <SelectValue placeholder="Không gán chương trình" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Không gán chương trình</SelectItem>
                  {(programs ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Loại nội dung *</label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn loại nội dung" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Bài học">Bài học</SelectItem>
                <SelectItem value="Bài tập về nhà">Bài tập về nhà</SelectItem>
                <SelectItem value="Giáo trình">Giáo trình</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div 
            className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 text-center space-y-2 hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => document.getElementById('file-upload')?.click()}
          >
            <input 
              id="file-upload" 
              type="file" 
              className="hidden" 
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              accept=".docx,.pdf,.pptx,.xlsx,.txt"
            />
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">
              {file ? file.name : "Click để chọn file hoặc kéo thả vào đây"}
            </p>
            <p className="text-xs text-muted-foreground">Hỗ trợ: .docx, .pdf, .pptx, .xlsx</p>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Gợi ý định dạng nội dung trong file:</p>
            <pre className="text-[11px] font-mono bg-background p-3 rounded border border-border/50 text-muted-foreground">
{`Buổi 1: Giới thiệu về IELTS
Nội dung:
ABCDEF

Buổi 2: Kỹ năng Listening
Nội dung:
...`}
            </pre>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Hủy</Button>
          <Button 
            className="gap-2" 
            onClick={handleUpload}
            disabled={!file || isProcessing}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Tải lên & Xử lý
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgramContentDialog({ program, defaultSession, content, trigger }: { 
  program: CourseProgram | undefined, 
  defaultSession?: number,
  content?: CourseProgramContent,
  trigger?: React.ReactNode 
}) {
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [linkInputVisible, setLinkInputVisible] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkPreview, setLinkPreview] = useState<string | null>(null);
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(insertCourseProgramContentSchema),
    defaultValues: content ? {
      programId: content.programId,
      sessionNumber: Number(content.sessionNumber),
      title: content.title,
      type: content.type,
      content: content.content || "",
      attachments: content.attachments || [] as string[],
      allowDownload: content.allowDownload ?? null,
    } : {
      programId: program?.id || "",
      sessionNumber: defaultSession || 1,
      title: "",
      type: "Bài học",
      content: "",
      attachments: [] as string[],
      allowDownload: null as boolean | null,
    }
  });

  useEffect(() => {
    if (content) {
      form.reset({
        programId: content.programId,
        sessionNumber: Number(content.sessionNumber),
        title: content.title,
        type: content.type,
        content: content.content || "",
        attachments: content.attachments || [] as string[],
        allowDownload: content.allowDownload ?? null,
      });
    } else if (program) {
      form.setValue("programId", program.id);
      if (defaultSession) {
        form.setValue("sessionNumber", defaultSession);
      }
    }
  }, [program, defaultSession, content, form]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (content) {
        const res = await apiRequest("PATCH", `/api/course-program-contents/${content.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", `/api/course-programs/${program?.id}/contents`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/course-programs", program?.id, "contents"] });
      toast({ title: "Thành công", description: content ? "Đã cập nhật nội dung" : "Đã thêm nội dung buổi học" });
      setOpen(false);
      if (!content) form.reset();
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  const MAX_FILE_SIZE_MB = 100;

  const uploadFiles = async (files: File[]): Promise<Array<{ name: string; url: string }>> => {
    const formData = new FormData();
    files.forEach(f => formData.append("files", f));
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.files;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const oversized = files.filter(f => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (oversized.length > 0) {
      toast({
        title: "File quá lớn",
        description: `Tối đa ${MAX_FILE_SIZE_MB}MB/file. File "${oversized[0].name}" vượt giới hạn.`,
        variant: "destructive"
      });
      e.target.value = "";
      return;
    }
    setIsUploading(true);
    try {
      const uploaded = await uploadFiles(files);
      const currentAttachments = form.getValues("attachments") || [];
      const newEntries = uploaded.map(f => `${f.name}||${f.url}`);
      form.setValue("attachments", [...currentAttachments, ...newEntries]);
    } catch {
      toast({ title: "Lỗi upload", description: "Không thể tải file lên", variant: "destructive" });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleImagePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setIsUploading(true);
    try {
      const uploaded = await uploadFiles([file]);
      const current = form.getValues("content") || "";
      const imgUrl = uploaded[0].url;
      form.setValue("content", current + (current ? "\n" : "") + imgUrl);
      setTimeout(() => autoResizeTextarea(contentTextareaRef.current), 0);
    } catch {
      toast({ title: "Lỗi upload ảnh", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);
    try {
      const uploaded = await uploadFiles(files);
      const current = form.getValues("content") || "";
      const urls = uploaded.map(f => f.url).join("\n");
      form.setValue("content", current + (current ? "\n" : "") + urls);
      setTimeout(() => autoResizeTextarea(contentTextareaRef.current), 0);
    } catch {
      toast({ title: "Lỗi upload ảnh", variant: "destructive" });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleInsertLink = () => {
    const url = linkValue.trim();
    if (!url) return;
    const current = form.getValues("content") || "";
    form.setValue("content", current + (current ? "\n" : "") + url);
    setLinkValue("");
    setLinkPreview(null);
    setLinkInputVisible(false);
    setTimeout(() => autoResizeTextarea(contentTextareaRef.current), 0);
  };

  const handleLinkChange = (val: string) => {
    setLinkValue(val);
    const ytId = getYoutubeId(val);
    if (ytId) {
      setLinkPreview(`youtube:${ytId}`);
    } else if (isVideoUrl(val)) {
      setLinkPreview(`video:${val}`);
    } else if (isImageUrl(val)) {
      setLinkPreview(`image:${val}`);
    } else {
      setLinkPreview(null);
    }
  };

  const handleRemoveAttachment = (idx: number) => {
    const current = form.getValues("attachments") || [];
    form.setValue("attachments", current.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="gap-2" disabled={!program}>
            <Plus className="h-4 w-4" />
            Nội dung
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[90vw] max-w-[90vw] max-h-[90vh] flex flex-col">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="flex flex-col flex-1 min-h-0">
        <DialogHeader className="shrink-0 flex flex-row items-center justify-between space-y-0 pb-2 border-b">
          <DialogTitle className="text-xl font-display">{content ? "Chỉnh sửa" : "Thêm"} Nội dung buổi học</DialogTitle>
          <Button type="submit" size="sm" className="ml-4 shrink-0" disabled={mutation.isPending || isUploading}>
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Lưu nội dung
          </Button>
        </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="sessionNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Buổi số</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={String(field.value)}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn buổi" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.from({ length: Number(program?.sessions || 0) }).map((_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>Buổi {i + 1}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loại</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn loại" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Bài học">Bài học</SelectItem>
                          <SelectItem value="Bài tập về nhà">Bài tập về nhà</SelectItem>
                          <SelectItem value="Giáo trình">Giáo trình</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên nội dung</FormLabel>
                    <FormControl>
                      <Input placeholder="Nhập tên nội dung" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between mb-1">
                      <FormLabel className="mb-0">Mô tả nội dung</FormLabel>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => imgInputRef.current?.click()}
                              disabled={isUploading}
                            >
                              <ImageIcon className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Đính kèm ảnh vào mô tả</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={cn("p-1.5 rounded hover:bg-muted transition-colors", linkInputVisible ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                              onClick={() => setLinkInputVisible(v => !v)}
                            >
                              <LinkIcon className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Thêm link / video</TooltipContent>
                        </Tooltip>
                        <input
                          ref={imgInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handleImageAttach}
                        />
                      </div>
                    </div>
                    {linkInputVisible && (
                      <div className="space-y-2 mb-2 p-3 rounded-lg border bg-muted/30">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Dán link video, ảnh hoặc URL..."
                            value={linkValue}
                            onChange={e => handleLinkChange(e.target.value)}
                            className="text-sm h-8"
                          />
                          <Button type="button" size="sm" onClick={handleInsertLink} disabled={!linkValue.trim()} className="shrink-0">
                            Chèn
                          </Button>
                        </div>
                        {linkPreview && (
                          <div className="rounded-lg overflow-hidden">
                            {linkPreview.startsWith("youtube:") && (
                              <div className="aspect-video">
                                <iframe
                                  src={`https://www.youtube.com/embed/${linkPreview.replace("youtube:", "")}`}
                                  className="w-full h-full"
                                  allowFullScreen
                                  title="preview"
                                />
                              </div>
                            )}
                            {linkPreview.startsWith("video:") && (
                              <video src={linkPreview.replace("video:", "")} controls className="w-full max-h-40 rounded" />
                            )}
                            {linkPreview.startsWith("image:") && (
                              <img src={linkPreview.replace("image:", "")} alt="preview" className="max-h-40 rounded object-contain" />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <FormControl>
                      <Textarea
                        placeholder="Nhập mô tả chi tiết, hoặc paste ảnh trực tiếp vào đây..."
                        {...field}
                        ref={(el) => {
                          contentTextareaRef.current = el;
                          field.ref(el);
                        }}
                        onPaste={handleImagePaste}
                        onInput={(e) => autoResizeTextarea(e.currentTarget)}
                        className="resize-none overflow-hidden min-h-[120px]"
                      />
                    </FormControl>
                    {isUploading && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Đang tải lên...
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Đính kèm file</FormLabel>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,video/*,.mp3,.wav,.ogg"
                  onChange={handleFileChange}
                />
                <div className="flex flex-wrap gap-2">
                  {form.watch("attachments")?.map((att, idx) => {
                    const { name } = parseAttachment(att);
                    return (
                      <div key={idx} className="bg-muted px-2 py-1 rounded text-xs flex items-center gap-1 max-w-[200px]">
                        <Paperclip className="h-3 w-3 shrink-0" />
                        <span className="truncate">{name}</span>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => handleRemoveAttachment(idx)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 px-2 border-dashed text-xs gap-1"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    data-testid="button-add-attachment"
                  >
                    {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Thêm file
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Ảnh, Word, Excel, PowerPoint, PDF, Video, MP3... | Tối đa {MAX_FILE_SIZE_MB}MB/file</p>
              </div>

              <FormField
                control={form.control}
                name="allowDownload"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-3 py-1">
                      <Checkbox
                        id="content-allow-download"
                        checked={field.value === true}
                        onCheckedChange={(checked) => field.onChange(checked === true ? true : (field.value === false ? false : null))}
                        className="w-4 h-4"
                      />
                      <label htmlFor="content-allow-download" className="text-sm font-medium cursor-pointer select-none">
                        Cho phép tải file đính kèm
                      </label>
                      <span className="text-xs text-muted-foreground">(để trống = theo mặc định vai trò)</span>
                    </div>
                    {field.value !== null && field.value !== undefined && (
                      <button type="button" onClick={() => field.onChange(null)} className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground underline ml-7">
                        Xoá ghi đè, dùng mặc định vai trò
                      </button>
                    )}
                  </FormItem>
                )}
              />
            </div>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function CourseDialog({ locations, editCourse, open: openProp, onOpenChange }: { locations: Location[]; editCourse?: Course; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const isEdit = !!editCourse;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = (v: boolean) => { onOpenChange ? onOpenChange(v) : setInternalOpen(v); };
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(insertCourseSchema),
    defaultValues: {
      code: editCourse?.code ?? "",
      name: editCourse?.name ?? "",
      locationId: editCourse?.locationId ?? "",
      note: editCourse?.note ?? ""
    }
  });

  useEffect(() => {
    if (open && editCourse) {
      form.reset({ code: editCourse.code, name: editCourse.name, locationId: editCourse.locationId ?? "", note: editCourse.note ?? "" });
    } else if (open && !editCourse) {
      form.reset({ code: "", name: "", locationId: "", note: "" });
    }
  }, [open, editCourse]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEdit && editCourse) {
        const res = await apiRequest("PUT", `/api/courses/${editCourse.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/courses", data);
      return res.json();
    },
    onSuccess: (updatedCourse) => {
      if (isEdit && updatedCourse?.id) {
        queryClient.setQueryData<Course[]>(["/api/courses"], (old = []) =>
          old.map(c => c.id === updatedCourse.id ? updatedCourse : c)
        );
      } else if (updatedCourse?.id) {
        queryClient.setQueryData<Course[]>(["/api/courses"], (old = []) =>
          [updatedCourse, ...(old || [])]
        );
      }
      toast({ title: "Thành công", description: isEdit ? "Đã cập nhật khoá học" : "Đã lưu khoá học mới" });
      setOpen(false);
      if (!isEdit) form.reset();
    },
    onError: (error: any) => {
      const msg = error?.message || "";
      if (msg.includes("duplicate key") || msg.includes("courses_code_unique")) {
        form.setError("code", { message: "Mã khoá học đã tồn tại, vui lòng chọn mã khác" });
      } else {
        toast({ title: "Lỗi", description: "Không thể lưu khoá học. Vui lòng thử lại.", variant: "destructive" });
      }
    },
  });

  const trigger = !isEdit ? (
    <Button size="sm" className="gap-2 shadow-md shadow-primary/20">
      <Plus className="h-4 w-4" />
      Khoá học
    </Button>
  ) : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">{isEdit ? "Sửa Khoá học" : "Thêm mới Khoá học"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mã khoá học</FormLabel>
                    <FormControl>
                      <Input placeholder="VD: ENG-01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên Khoá học</FormLabel>
                    <FormControl>
                      <Input placeholder="Nhập tên khoá học" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cơ sở</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn cơ sở" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {locations.map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ghi chú</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Nhập ghi chú (nếu có)" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isEdit ? "Cập nhật khoá học" : "Lưu khoá học"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function FeePackageDialog({
  courseId,
  trigger,
  editPackage,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  courseId: string | null;
  trigger?: React.ReactNode;
  editPackage?: CourseFeePackage;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isEdit = !!editPackage;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertCourseFeePackageSchema),
    defaultValues: {
      courseId: courseId || editPackage?.courseId || "",
      name: editPackage?.name || "",
      type: (editPackage?.type as "buổi" | "khoá") || "buổi",
      fee: Number(editPackage?.fee) || 0,
      sessions: Number(editPackage?.sessions) || 0,
      totalAmount: Number(editPackage?.totalAmount) || 0,
    }
  });

  useEffect(() => {
    if (open) {
      form.reset({
        courseId: courseId || editPackage?.courseId || "",
        name: editPackage?.name || "",
        type: (editPackage?.type as "buổi" | "khoá") || "buổi",
        fee: Number(editPackage?.fee) || 0,
        sessions: Number(editPackage?.sessions) || 0,
        totalAmount: Number(editPackage?.totalAmount) || 0,
      });
    }
  }, [open, editPackage, courseId]);

  useEffect(() => {
    if (courseId && !isEdit) form.setValue("courseId", courseId);
  }, [courseId, form, isEdit]);

  const watchType = form.watch("type");
  const watchFee = form.watch("fee");
  const watchSessions = form.watch("sessions");

  useEffect(() => {
    const fee = Number(watchFee) || 0;
    const sessions = Number(watchSessions) || 0;
    if (watchType === "buổi") {
      form.setValue("totalAmount", fee * sessions);
    } else {
      form.setValue("totalAmount", fee);
    }
  }, [watchType, watchFee, watchSessions, form]);

  const effectiveCourseId = courseId || editPackage?.courseId;

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEdit && editPackage) {
        const res = await apiRequest("PUT", `/api/courses/${editPackage.courseId}/fee-packages/${editPackage.id}`, data);
        return res.json();
      }
      const res = await apiRequest("POST", `/api/courses/${effectiveCourseId}/fee-packages`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", effectiveCourseId, "fee-packages"] });
      toast({ title: "Thành công", description: isEdit ? "Đã cập nhật gói học phí" : "Đã lưu gói học phí mới" });
      setOpen(false);
      if (!isEdit) form.reset();
    },
  });

  const dialogContent = (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle className="text-xl font-display">{isEdit ? "Chỉnh sửa Gói học phí" : "Thêm mới Gói học phí"}</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4 py-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tên Gói học phí</FormLabel>
                <FormControl>
                  <Input placeholder="VD: Gói Cơ Bản" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn loại" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="buổi">Buổi</SelectItem>
                      <SelectItem value="khoá">Khoá</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Học phí ({watchType === 'buổi' ? '/buổi' : '/khoá'})</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type="number" placeholder="0" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">VNĐ</span>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="sessions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Số tiết</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="totalAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Thành tiền</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type="number" readOnly className="bg-muted/50" {...field} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">VNĐ</span>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <DialogFooter className="pt-4">
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isEdit ? "Cập nhật" : "Lưu gói học phí"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );

  if (isEdit) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5 text-primary" disabled={!courseId}>
            <Plus className="h-4 w-4" />
            Gói học phí
          </Button>
        )}
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
