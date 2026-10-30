import { apiClient } from "./client";
import type {
  LiveKitTokenResponse,
  MonitoringOverview,
} from "@satark/shared-types";

export const mediaApi = {
  getToken: (
    examId: string,
    options?: { can_publish?: boolean; is_camera?: boolean }
  ) =>
    apiClient<LiveKitTokenResponse>(`/media/${examId}/token`, {
      method: "POST",
      body: JSON.stringify(options || {}),
    }),

  getOverview: (examId: string) =>
    apiClient<MonitoringOverview>(`/media/${examId}/overview`),

  requestShare: (examId: string, studentId?: string) =>
    apiClient<{ message: string }>(`/media/${examId}/request-share`, {
      method: "POST",
      body: JSON.stringify({ student_id: studentId }),
    }),

  respondToShare: (examId: string, approved: boolean, reason?: string) =>
    apiClient<{ status: string; student_id: string }>(
      `/media/${examId}/share-response`,
      {
        method: "POST",
        body: JSON.stringify({ approved, reason }),
      }
    ),

  updateStreamState: (examId: string, isSharing: boolean, error?: string) =>
    apiClient<{ is_sharing: boolean; student_id: string }>(
      `/media/${examId}/stream-state`,
      {
        method: "POST",
        body: JSON.stringify({ is_sharing: isSharing, error }),
      }
    ),

  broadcastAnnouncement: (
    examId: string,
    message: string,
    priority: "normal" | "urgent" = "normal"
  ) =>
    apiClient<{ message: string; recipient_count: number }>(
      `/media/${examId}/broadcast`,
      {
        method: "POST",
        body: JSON.stringify({ message, priority }),
      }
    ),
};

