import { apiClient } from "./client";

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: "exam_announcement" | "focus_nudge" | "security" | string;
  is_read: boolean;
  created_at: string;
}

export const notificationsApi = {
  list: (isRead?: boolean) => {
    let endpoint = "/notifications";
    if (isRead !== undefined) endpoint += `?is_read=${isRead}`;
    return apiClient<NotificationItem[]>(endpoint);
  },

  markRead: (id: string) =>
    apiClient<NotificationItem>(`/notifications/${id}/read`, {
      method: "POST",
    }),

  markAllRead: () =>
    apiClient<{ message: string; updated_count: number }>("/notifications/read-all", {
      method: "POST",
    }),
};
