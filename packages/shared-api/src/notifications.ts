import { apiClient } from "./client";
import type { NotificationItem } from "@satark/shared-types";

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

