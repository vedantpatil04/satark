import { apiClient } from "./client";
import type { FocusSession } from "@satark/shared-types";

export const focusApi = {
  start: (payload: { goal_title: string; planned_duration_minutes: number; classroom_id?: string }) =>
    apiClient<FocusSession>("/focus/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  list: () => apiClient<FocusSession[]>("/focus/sessions"),

  get: (id: string) => apiClient<FocusSession>(`/focus/sessions/${id}`),

  pause: (id: string, additional_focus_seconds: number = 0, notes?: string) =>
    apiClient<FocusSession>(`/focus/sessions/${id}/pause`, {
      method: "POST",
      body: JSON.stringify({ additional_focus_seconds, notes }),
    }),

  resume: (id: string, additional_break_seconds: number = 0) =>
    apiClient<FocusSession>(`/focus/sessions/${id}/resume`, {
      method: "POST",
      body: JSON.stringify({ additional_break_seconds }),
    }),

  complete: (id: string, additional_focus_seconds: number = 0, additional_break_seconds: number = 0, notes?: string) =>
    apiClient<FocusSession>(`/focus/sessions/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({ additional_focus_seconds, additional_break_seconds, notes }),
    }),

  getHistory: () => apiClient<FocusSession[]>("/focus/history"),
};

