import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider, Toaster, Sonner } from "@satark/shared-ui";
import { AuthProvider, ProtectedRoute } from "@satark/shared-auth";

import { TeacherLayout } from "./layouts/TeacherLayout";
import { TeacherLogin } from "./pages/TeacherLogin";
import { TeacherDashboard } from "./pages/TeacherDashboard";
import { TeacherClassrooms } from "./pages/TeacherClassrooms";
import { TeacherClassroomDetail } from "./pages/TeacherClassroomDetail";
import { TeacherExams } from "./pages/TeacherExams";
import { TeacherExamDetail } from "./pages/TeacherExamDetail";
import { TeacherDevices } from "./pages/TeacherDevices";
import { TeacherFocus } from "./pages/TeacherFocus";
import { TeacherAlerts } from "./pages/TeacherAlerts";
import { TeacherNotifications } from "./pages/TeacherNotifications";
import { TeacherQuestionBank } from "./pages/TeacherQuestionBank";
import { LiveMonitoring } from "./pages/exams/LiveMonitoring";

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
            {/* Public Auth Routes */}
            <Route path="/login" element={<TeacherLogin />} />
            <Route path="/teacher/login" element={<TeacherLogin />} />

            {/* Protected Teacher Portal */}
            <Route element={<ProtectedRoute allowedRole="teacher" loginPath="/login" />}>
              <Route element={<TeacherLayout />}>
                {/* Default root navigation */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/teacher" element={<Navigate to="/dashboard" replace />} />
                <Route path="/teacher/dashboard" element={<Navigate to="/dashboard" replace />} />
                
                <Route path="/dashboard" element={<TeacherDashboard />} />
                <Route path="/classrooms" element={<TeacherClassrooms />} />
                <Route path="/classrooms/:id" element={<TeacherClassroomDetail />} />
                <Route path="/teacher/classrooms" element={<Navigate to="/classrooms" replace />} />
                <Route path="/teacher/classrooms/:id" element={<TeacherClassroomDetail />} />

                <Route path="/exams" element={<TeacherExams />} />
                <Route path="/exams/:id" element={<TeacherExamDetail />} />
                <Route path="/exams/:id/live" element={<LiveMonitoring />} />
                <Route path="/teacher/exams" element={<Navigate to="/exams" replace />} />
                <Route path="/teacher/exams/:id" element={<TeacherExamDetail />} />
                <Route path="/teacher/exams/:examId/live" element={<LiveMonitoring />} />

                <Route path="/question-bank" element={<TeacherQuestionBank />} />
                <Route path="/teacher/question-bank" element={<Navigate to="/question-bank" replace />} />

                <Route path="/devices" element={<TeacherDevices />} />
                <Route path="/teacher/devices" element={<Navigate to="/devices" replace />} />

                <Route path="/focus" element={<TeacherFocus />} />
                <Route path="/teacher/focus" element={<Navigate to="/focus" replace />} />

                <Route path="/alerts" element={<TeacherAlerts />} />
                <Route path="/reports" element={<TeacherAlerts />} />
                <Route path="/teacher/alerts" element={<Navigate to="/alerts" replace />} />
                <Route path="/teacher/reports" element={<Navigate to="/alerts" replace />} />

                <Route path="/notifications" element={<TeacherNotifications />} />
                <Route path="/teacher/notifications" element={<Navigate to="/notifications" replace />} />
              </Route>
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
