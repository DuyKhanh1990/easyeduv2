import { lazy, Suspense } from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TinodeProvider } from "@/hooks/use-tinode";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useFavicon } from "@/hooks/use-favicon";
import { LanguageProvider } from "@/hooks/use-language";

const NotFound = lazy(() => import("@/pages/not-found"));

const Login = lazy(() => import("@/pages/auth/Login").then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import("@/pages/dashboard/Dashboard").then(m => ({ default: m.Dashboard })));

const CustomersList = lazy(() => import("@/pages/customers/CustomersList").then(m => ({ default: m.CustomersList })));
const CustomerDetailPage = lazy(() => import("@/pages/customers/CustomerDetailPage").then(m => ({ default: m.CustomerDetailPage })));
const CRMConfig = lazy(() => import("@/pages/customers/CRMConfig").then(m => ({ default: m.CRMConfig })));
const NotificationLogs = lazy(() => import("@/pages/notifications/NotificationLogs").then(m => ({ default: m.NotificationLogs })));

const StaffList = lazy(() => import("@/pages/staff/StaffList").then(m => ({ default: m.StaffList })));
const ShiftManagement = lazy(() => import("@/pages/shifts/ShiftManagement").then(m => ({ default: m.ShiftManagement })));
const Settings = lazy(() => import("@/pages/settings/Settings").then(m => ({ default: m.Settings })));

const CoursesPrograms = lazy(() => import("@/pages/courses/CoursesPrograms"));
const Assessments = lazy(() => import("@/pages/courses/Assessments"));
const ExamDetail = lazy(() => import("@/pages/courses/ExamDetail").then(m => ({ default: m.ExamDetail })));

const EducationConfig = lazy(() => import("@/pages/education/EducationConfig"));
const ClassList = lazy(() => import("@/pages/education/ClassList").then(m => ({ default: m.ClassList })));
const CreateClass = lazy(() => import("@/pages/education/CreateClass").then(m => ({ default: m.CreateClass })));
const CreateTutorClass = lazy(() => import("@/pages/education/CreateTutorClass").then(m => ({ default: m.CreateTutorClass })));
const ClassDetail = lazy(() => import("@/pages/education/ClassDetail").then(m => ({ default: m.ClassDetail })));
const Attendance = lazy(() => import("@/pages/education/Attendance").then(m => ({ default: m.Attendance })));
const LearningOverview = lazy(() => import("@/pages/education/learning-overview").then(m => ({ default: m.LearningOverview })));
const Schedule = lazy(() => import("@/pages/education/Schedule").then(m => ({ default: m.Schedule })));

const FinanceConfig = lazy(() => import("@/pages/finance/FinanceConfig"));
const Invoices = lazy(() => import("@/pages/finance/Invoices"));
const DeferredTuition = lazy(() => import("@/pages/finance/DeferredTuition"));
const Reconciliation = lazy(() => import("@/pages/finance/BidvReconciliation"));
const StorePage = lazy(() => import("@/pages/store/StorePage").then(m => ({ default: m.StorePage })));

const MyCalendar = lazy(() => import("@/pages/my-space/MyCalendar"));
const MyAssignments = lazy(() => import("@/pages/my-space/MyAssignments"));
const MyInvoices = lazy(() => import("@/pages/my-space/MyInvoices"));
const MyPayroll = lazy(() => import("@/pages/my-space/MyPayroll"));
const MyScoreSheet = lazy(() => import("@/pages/my-space/MyScoreSheet"));
const MyDonTu = lazy(() => import("@/pages/my-space/MyDonTu"));
const ExamTakingPage = lazy(() => import("@/pages/my-space/ExamTakingPage").then(m => ({ default: m.ExamTakingPage })));

const TeacherSalary = lazy(() => import("@/pages/hrm/TeacherSalary").then(m => ({ default: m.TeacherSalary })));
const ChamCong = lazy(() => import("@/pages/hrm/ChamCong").then(m => ({ default: m.ChamCong })));
const TongLuong = lazy(() => import("@/pages/hrm/TongLuong"));
const DonTuPage = lazy(() => import("@/pages/don-tu/DonTuPage").then(m => ({ default: m.DonTuPage })));
const Commission = lazy(() => import("@/pages/hrm/Commission").then(m => ({ default: m.Commission })));
const Tasks = lazy(() => import("@/pages/tasks/Tasks"));
const NewsFeed = lazy(() => import("@/pages/news-feed/NewsFeed").then(m => ({ default: m.NewsFeed })));
const ChatPage = lazy(() => import("@/pages/chat/ChatPage").then(m => ({ default: m.ChatPage })));
const ZaloPage = lazy(() => import("@/pages/chat/ZaloOAChatPage").then(m => ({ default: m.ZaloOAChatPage })));
const FacebookPage = lazy(() => import("@/pages/chat/FacebookChatPage").then(m => ({ default: m.FacebookChatPage })));
const RegistrationFormPage = lazy(() => import("@/pages/registration/RegistrationFormPage").then(m => ({ default: m.RegistrationFormPage })));

const PageLoader = () => (
  <div className="flex h-screen w-full items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Đang tải...</p>
    </div>
  </div>
);

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/dang-ky" component={RegistrationFormPage} />
        <Route path="/" component={Dashboard} />
        <Route path="/customers/crm-config" component={CRMConfig} />
        <Route path="/customers/:id" component={CustomerDetailPage} />
        <Route path="/customers" component={CustomersList} />
        <Route path="/notification-logs" component={NotificationLogs} />
        <Route path="/staff" component={StaffList} />
        <Route path="/shifts" component={ShiftManagement} />
        <Route path="/teacher-salary" component={TeacherSalary} />
        <Route path="/cham-cong" component={ChamCong} />
        <Route path="/tong-luong" component={TongLuong} />
        <Route path="/courses" component={CoursesPrograms} />
        <Route path="/programs" component={() => <Redirect to="/courses" />} />
        <Route path="/content-library" component={() => <Redirect to="/courses" />} />
        <Route path="/assessments" component={Assessments} />
        <Route path="/assessments/:id" component={ExamDetail} />
        <Route path="/education-config" component={EducationConfig} />
        <Route path="/classrooms" component={() => <Redirect to="/education-config?tab=classrooms" />} />
        <Route path="/subjects" component={() => <Redirect to="/education-config?tab=subjects" />} />
        <Route path="/evaluation-criteria" component={() => <Redirect to="/education-config?tab=evaluation" />} />
        <Route path="/classes" component={ClassList} />
        <Route path="/classes/create" component={CreateClass} />
        <Route path="/classes/create-tutor" component={CreateTutorClass} />
        <Route path="/classes/:id" component={ClassDetail} />
        <Route path="/schedule" component={Schedule} />
        <Route path="/learning-overview" component={LearningOverview} />
        <Route path="/attendance" component={Attendance} />
        <Route path="/invoices/new" component={Invoices} />
        <Route path="/invoices/debt" component={Invoices} />
        <Route path="/invoices/:id" component={Invoices} />
        <Route path="/invoices" component={Invoices} />
        <Route path="/deferred-tuition" component={DeferredTuition} />
        <Route path="/finance-config" component={FinanceConfig} />
        <Route path="/reconciliation" component={Reconciliation} />
        <Route path="/bidv-reconciliation" component={() => <Redirect to="/reconciliation" />} />
        <Route path="/store" component={StorePage} />
        <Route path="/my-space/calendar" component={MyCalendar} />
        <Route path="/my-space/assignments" component={MyAssignments} />
        <Route path="/my-space/exam/:id" component={ExamTakingPage} />
        <Route path="/my-space/score-sheet" component={MyScoreSheet} />
        <Route path="/my-space/invoices" component={MyInvoices} />
        <Route path="/my-space/payroll" component={MyPayroll} />
        <Route path="/my-space/don-tu" component={MyDonTu} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/news-feed" component={NewsFeed} />
        <Route path="/chat" component={ChatPage} />
        <Route path="/zalo" component={ZaloPage} />
        <Route path="/facebook" component={FacebookPage} />
        <Route path="/don-tu" component={DonTuPage} />
        <Route path="/commission" component={Commission} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function FaviconUpdater() {
  useFavicon();
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <FaviconUpdater />
          <TooltipProvider>
            <TinodeProvider>
              <ErrorBoundary>
                <WouterRouter>
                  <Router />
                </WouterRouter>
              </ErrorBoundary>
              <Toaster />
            </TinodeProvider>
          </TooltipProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
