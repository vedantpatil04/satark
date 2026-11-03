import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider, Toaster, Sonner } from "@satark/shared-ui";
import { AuthProvider, ProtectedRoute } from "@satark/shared-auth";

import { StudentLayout } from "./layouts/StudentLayout";
import { StudentLogin } from "./pages/StudentLogin";
import { StudentDashboard } from "./pages/StudentDashboard";
import { StudentClassrooms } from "./pages/StudentClassrooms";
import { StudentExams } from "./pages/StudentExams";
import { StudentExamView } from "./pages/StudentExamView";
import { StudentFocus } from "./pages/StudentFocus";
import FocusMode from "./pages/FocusMode";
import TimeSelection from "./pages/TimeSelection";
import { StudentHistory } from "./pages/StudentHistory";
import { StudentNotifications } from "./pages/StudentNotifications";
import { StudentCompiler } from "./pages/StudentCompiler";
import { StudentNotes } from "./pages/StudentNotes";

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
            <Route path="/login" element={<StudentLogin />} />
            <Route path="/student/login" element={<StudentLogin />} />

            {/* Protected Student Portal */}
            <Route element={<ProtectedRoute allowedRole="student" loginPath="/login" />}>
              <Route element={<StudentLayout />}>
                {/* Default root navigation */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/student" element={<Navigate to="/dashboard" replace />} />
                <Route path="/student/dashboard" element={<Navigate to="/dashboard" replace />} />

                <Route path="/dashboard" element={<StudentDashboard />} />
                <Route path="/compiler" element={<StudentCompiler />} />
                <Route path="/student/compiler" element={<Navigate to="/compiler" replace />} />
                <Route path="/notes" element={<StudentNotes />} />
                <Route path="/notes/:classroomId" element={<StudentNotes />} />
                <Route path="/student/notes" element={<Navigate to="/notes" replace />} />
                <Route path="/student/notes/:classroomId" element={<StudentNotes />} />
                <Route path="/classrooms" element={<StudentClassrooms />} />
                <Route path="/student/classrooms" element={<Navigate to="/classrooms" replace />} />

                <Route path="/exams" element={<StudentExams />} />
                <Route path="/student/exams" element={<Navigate to="/exams" replace />} />

                <Route path="/focus" element={<StudentFocus />} />
                <Route path="/student/focus" element={<Navigate to="/focus" replace />} />

                <Route path="/history" element={<StudentHistory />} />
                <Route path="/student/history" element={<Navigate to="/history" replace />} />

                <Route path="/notifications" element={<StudentNotifications />} />
                <Route path="/student/notifications" element={<Navigate to="/notifications" replace />} />
              </Route>

              {/* Fullscreen Views (outside sidebar layout) */}
              <Route path="/exams/:id" element={<StudentExamView />} />
              <Route path="/student/exams/:id" element={<StudentExamView />} />
              <Route path="/focus/mode" element={<FocusMode />} />
              <Route path="/focus-mode" element={<FocusMode />} />
              <Route path="/time-selection" element={<TimeSelection />} />
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

