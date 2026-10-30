import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Layouts
import { TeacherLayout } from "@/layouts/TeacherLayout";
import { StudentLayout } from "@/layouts/StudentLayout";

// Shared Pages
import { Home } from "@/pages/Home";
import NotFound from "@/pages/NotFound";
import TimeSelection from "@/pages/TimeSelection";
import FocusMode from "@/pages/FocusMode";

// Teacher Pages
import { TeacherLogin } from "@/pages/teacher/TeacherLogin";
import { TeacherDashboard } from "@/pages/teacher/TeacherDashboard";
import { TeacherClassrooms } from "@/pages/teacher/TeacherClassrooms";
import { TeacherClassroomDetail } from "@/pages/teacher/TeacherClassroomDetail";
import { TeacherExams } from "@/pages/teacher/TeacherExams";
import { TeacherExamDetail } from "@/pages/teacher/TeacherExamDetail";
import { TeacherDevices } from "@/pages/teacher/TeacherDevices";
import { TeacherFocus } from "@/pages/teacher/TeacherFocus";
import { TeacherAlerts } from "@/pages/teacher/TeacherAlerts";
import { TeacherNotifications } from "@/pages/teacher/TeacherNotifications";

// Student Pages
import { StudentLogin } from "@/pages/student/StudentLogin";
import { StudentDashboard } from "@/pages/student/StudentDashboard";
import { StudentClassrooms } from "@/pages/student/StudentClassrooms";
import { StudentExams } from "@/pages/student/StudentExams";
import { StudentExamView } from "@/pages/student/StudentExamView";
import { StudentFocus } from "@/pages/student/StudentFocus";
import { StudentHistory } from "@/pages/student/StudentHistory";
import { StudentNotifications } from "@/pages/student/StudentNotifications";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner richColors position="top-right" />
        <BrowserRouter>
          <Routes>
            {/* Root & Public Role Selector */}
            <Route path="/" element={<Home />} />
            <Route path="/time-selection" element={<TimeSelection />} />
            <Route path="/focus" element={<FocusMode />} />

            {/* Teacher Public Routes */}
            <Route path="/teacher/login" element={<TeacherLogin />} />

            {/* Teacher Protected Portal */}
            <Route element={<ProtectedRoute allowedRole="teacher" />}>
              <Route element={<TeacherLayout />}>
                <Route path="/teacher" element={<Navigate to="/teacher/dashboard" replace />} />
                <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
                <Route path="/teacher/classrooms" element={<TeacherClassrooms />} />
                <Route path="/teacher/classrooms/:id" element={<TeacherClassroomDetail />} />
                <Route path="/teacher/exams" element={<TeacherExams />} />
                <Route path="/teacher/exams/:id" element={<TeacherExamDetail />} />
                <Route path="/teacher/devices" element={<TeacherDevices />} />
                <Route path="/teacher/focus" element={<TeacherFocus />} />
                <Route path="/teacher/alerts" element={<TeacherAlerts />} />
                <Route path="/teacher/reports" element={<TeacherAlerts />} />
                <Route path="/teacher/notifications" element={<TeacherNotifications />} />
              </Route>
            </Route>

            {/* Student Public Routes */}
            <Route path="/student/login" element={<StudentLogin />} />

            {/* Student Protected Portal */}
            <Route element={<ProtectedRoute allowedRole="student" />}>
              <Route element={<StudentLayout />}>
                <Route path="/student" element={<Navigate to="/student/dashboard" replace />} />
                <Route path="/student/dashboard" element={<StudentDashboard />} />
                <Route path="/student/classrooms" element={<StudentClassrooms />} />
                <Route path="/student/exams" element={<StudentExams />} />
                <Route path="/student/exams/:id" element={<StudentExamView />} />
                <Route path="/student/focus" element={<StudentFocus />} />
                <Route path="/student/history" element={<StudentHistory />} />
                <Route path="/student/notifications" element={<StudentNotifications />} />
              </Route>
            </Route>

            {/* Catch-all 404 Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;