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
      options: string[];
      correct_option_index: number;
      marks?: number;
      order_num?: number;
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
      options?: string[];
      correct_option_index?: number;
      marks?: number;
      order_num?: number;
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

  // Student Answers & Submission APIs
  saveAnswer: (
    examId: string,
    payload: {
      question_id: string;
      selected_option_index?: number | null;
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
      }[];
    } = {}
  ) =>
    apiClient<ExamSubmission>(`/exams/${examId}/submit`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getSubmissions: (examId: string) =>
    apiClient<ExamSubmission[]>(`/exams/${examId}/submissions`),

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
};

export type { ExamQuestion, StudentAnswer, ExamSubmission } from "@satark/shared-types";

