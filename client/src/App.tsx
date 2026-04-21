import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TinodeProvider } from "@/hooks/use-tinode";
import NotFound from "@/pages/not-found";

// Pages
import { Login } from "@/pages/auth/Login";
import { Dashboard } from "@/pages/dashboard/Dashboard";
import { CustomersList } from "@/pages/customers/CustomersList";
import { CRMConfig } from "@/pages/customers/CRMConfig";
import { StaffList } from "@/pages/staff/StaffList";
import { ShiftManagement } from "@/pages/shifts/ShiftManagement";
import { Settings } from "@/pages/settings/Settings";
import CoursesPrograms from "@/pages/courses/CoursesPrograms";
import Assessments from "@/pages/courses/Assessments";
import { ExamDetail } from "@/pages/courses/ExamDetail";
import EducationConfig from "@/pages/education/EducationConfig";
import { ClassList } from "@/pages/education/ClassList";
import { CreateClass } from "@/pages/education/CreateClass";
import { ClassDetail } from "@/pages/education/ClassDetail";
import { Attendance } from "@/pages/education/Attendance";
import { LearningOverview } from "@/pages/education/learning-overview";
import { Schedule } from "@/pages/education/Schedule";
import FinanceConfig from "@/pages/finance/FinanceConfig";
import Invoices from "@/pages/finance/Invoices";
import MyCalendar from "@/pages/my-space/MyCalendar";
import MyAssignments from "@/pages/my-space/MyAssignments";
import MyInvoices from "@/pages/my-space/MyInvoices";
import MyPayroll from "@/pages/my-space/MyPayroll";
import MyScoreSheet from "@/pages/my-space/MyScoreSheet";
import { TeacherSalary } from "@/pages/hrm/TeacherSalary";
import Tasks from "@/pages/tasks/Tasks";
import { ChatPage } from "@/pages/chat/ChatPage";

// Temporary placeholder for missing pages
const PlaceholderPage = ({ title }: { title: string }) => {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-foreground flex-col gap-4">
      <h1 className="text-3xl font-display font-bold">{title}</h1>
      <p className="text-muted-foreground">Tính năng đang được phát triển...</p>
      <a href="/" className="text-primary hover:underline">Quay lại Dashboard</a>
    </div>
  );
};

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Dashboard} />
      <Route path="/customers" component={CustomersList} />
      <Route path="/customers/crm-config" component={CRMConfig} />
      <Route path="/staff" component={StaffList} />
      <Route path="/shifts" component={ShiftManagement} />
      <Route path="/teacher-salary" component={TeacherSalary} />
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
      <Route path="/classes/:id" component={ClassDetail} />
      <Route path="/schedule" component={Schedule} />
      <Route path="/learning-overview" component={LearningOverview} />
      <Route path="/attendance" component={Attendance} />
      <Route path="/invoices" component={Invoices} />
      <Route path="/finance-config" component={FinanceConfig} />
      <Route path="/my-space/calendar" component={MyCalendar} />
      <Route path="/my-space/assignments" component={MyAssignments} />
      <Route path="/my-space/score-sheet" component={MyScoreSheet} />
      <Route path="/my-space/invoices" component={MyInvoices} />
      <Route path="/my-space/payroll" component={MyPayroll} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TinodeProvider>
          <Router />
          <Toaster />
        </TinodeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
