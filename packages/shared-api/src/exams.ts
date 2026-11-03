import { apiClient } from "./client";
import type { ExamQuestion, StudentAnswer, ExamSubmission } from "@satark/shared-types";

export interface ExamSession {
  id: string;
  classroom_id: string;
  teacher_id: string;
  title: string;
  description?: string;
  exam_code: string;
  duration_minutes: number;
  scheduled_start: string;
  actual_start?: string;
  actual_end?: string;
  status: "draft" | "scheduled" | "active" | "paused" | "ended";
  policy_config: Record<string, any>;
  is_results_published?: boolean;
  passing_percentage?: number;
  created_at: string;
}

export interface ExamActionResponse {
  id: string;
  status: string;
  message: string;
}

export const examsApi = {
  list: () => apiClient<ExamSession[]>("/exams"),

  get: (id: string) => apiClient<ExamSession>(`/exams/${id}`),

  create: (payload: {
    classroom_id: string;
    title: string;
    description?: string;
    exam_code?: string;
    duration_minutes: number;
    scheduled_start?: string;
    policy_config?: Record<string, any>;
  }) =>
    apiClient<ExamSession>("/exams", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  join: (id: string, exam_code: string, device_id?: string) =>
    apiClient<ExamSession>(`/exams/${id}/join`, {
      method: "POST",
      body: JSON.stringify({ exam_code, device_id }),
    }),

  start: (id: string) =>
    apiClient<ExamActionResponse>(`/exams/${id}/start`, {
      method: "POST",
    }),

  pause: (id: string) =>
    apiClient<ExamActionResponse>(`/exams/${id}/pause`, {
      method: "POST",
    }),

  resume: (id: string) =>
    apiClient<ExamActionResponse>(`/exams/${id}/resume`, {
      method: "POST",
    }),

  end: (id: string) =>
    apiClient<ExamActionResponse>(`/exams/${id}/end`, {
      method: "POST",
    }),

  grantTime: (id: string, additionalMinutes: number) =>
    apiClient<{ exam_id: string; duration_minutes: number; additional_minutes: number; message: string }>(
      `/exams/${id}/grant-time`,
      {
        method: "POST",
        body: JSON.stringify({ additional_minutes: additionalMinutes }),
      }
    ),

  // Questions APIs
  getQuestions: (examId: string) =>
    apiClient<ExamQuestion[]>(`/exams/${examId}/questions`),

  createQuestion: (
    examId: string,
    payload: {
      question_text: string;
      question_type?: string;
      options?: string[];
      correct_option_index?: number | null;
      correct_answers?: any[];
      marks?: number;
      order_num?: number;
      explanation?: string;
    }
  ) =>
    apiClient<ExamQuestion>(`/exams/${examId}/questions`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateQuestion: (
    examId: string,
    questionId: string,
    payload: {
      question_text?: string;
      question_type?: string;
      options?: string[];
      correct_option_index?: number | null;
      correct_answers?: any[];
      marks?: number;
      order_num?: number;
      explanation?: string;
    }
  ) =>
    apiClient<ExamQuestion>(`/exams/${examId}/questions/${questionId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteQuestion: (examId: string, questionId: string) =>
    apiClient<{ message: string }>(`/exams/${examId}/questions/${questionId}`, {
      method: "DELETE",
    }),

  getQuestionsTemplate: () =>
    apiClient<any>("/exams/questions/template"),

  importQuestionsJson: (examId: string, payload: any, preview: boolean = false) =>
    apiClient<any>(`/exams/${examId}/questions/import-json?preview=${preview}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  exportQuestionsJson: (examId: string) =>
    apiClient<any>(`/exams/${examId}/questions/export-json`),

  // Student Answers & Submission APIs
  saveAnswer: (
    examId: string,
    payload: {
      question_id: string;
      selected_option_index?: number | null;
      selected_options?: number[];
      text_answer?: string | null;
    }
  ) =>
    apiClient<StudentAnswer>(`/exams/${examId}/answers`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getAnswers: (examId: string) =>
    apiClient<StudentAnswer[]>(`/exams/${examId}/answers`),

  submitExam: (
    examId: string,
    payload: {
      answers?: {
        question_id: string;
        selected_option_index?: number | null;
        selected_options?: number[];
        text_answer?: string | null;
      }[];
    } = {}
  ) =>
    apiClient<ExamSubmission>(`/exams/${examId}/submit`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getSubmissions: (examId: string) =>
    apiClient<ExamSubmission[]>(`/exams/${examId}/submissions`),

  getSubmissionReview: (examId: string, submissionId: string) =>
    apiClient<any>(`/exams/${examId}/submissions/${submissionId}/review`),

  publishResults: (examId: string, passingPercentage?: number) =>
    apiClient<{ status: string; is_results_published: boolean; passing_percentage: number }>(
      `/exams/${examId}/publish-results`,
      {
        method: "POST",
        body: JSON.stringify({ passing_percentage: passingPercentage }),
      }
    ),

  gradeAnswer: (
    examId: string,
    submissionId: string,
    questionId: string,
    manualScore: number,
    feedback?: string
  ) =>
    apiClient<any>(
      `/exams/${examId}/submissions/${submissionId}/answers/${questionId}/grade`,
      {
        method: "PUT",
        body: JSON.stringify({ manual_score: manualScore, feedback }),
      }
    ),

  downloadPdf: async (examId: string, submissionId: string, filename?: string) => {
    const token = typeof window !== "undefined"
      ? (localStorage.getItem("auth_token") || localStorage.getItem("satark_token") || localStorage.getItem("token"))
      : null;
    const res = await fetch(`/api/v1/exams/${examId}/submissions/${submissionId}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to download PDF" }));
      throw new Error(err.detail || "Failed to download PDF");
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `SATARK_Result_${examId.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // Tab-Switch Browser Visibility Event
  sendTabSwitch: (
    examId: string,
    payload: {
      event_id?: string;
      occurred_at?: string;
      details?: Record<string, any>;
      device_id?: string;
    }
  ) =>
    apiClient<{ status: string; event_id: string; alert_triggered: boolean }>(
      `/exams/${examId}/tab-switch`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  // Student Re-Admission / Unlock APIs (Feature: 3 Tab Switch Lockout & Teacher Approval)
  requestUnlock: (
    examId: string,
    payload?: {
      reason?: string;
      tab_switch_number?: number;
    }
  ) =>
    apiClient<{ status: string; message: string }>(
      `/exams/${examId}/request-unlock`,
      {
        method: "POST",
        body: JSON.stringify(payload || {}),
      }
    ),

  unlockStudent: (examId: string, studentId: string) =>
    apiClient<{ status: string; message: string }>(
      `/exams/${examId}/students/${studentId}/unlock`,
      {
        method: "POST",
      }
    ),

  // Snapshot & Question Bank Import APIs
  importFromBank: (examId: string, itemIds: string[]) =>
    apiClient<ExamQuestion[]>(`/exams/${examId}/import-from-bank`, {
      method: "POST",
      body: JSON.stringify({ item_ids: itemIds }),
    }),

  createSnapshot: (examId: string) =>
    apiClient<any>(`/exams/${examId}/snapshot`, {
      method: "POST",
    }),

  getSnapshot: (examId: string) =>
    apiClient<any>(`/exams/${examId}/snapshot`),
};

export type { ExamQuestion, StudentAnswer, ExamSubmission } from "@satark/shared-types";

