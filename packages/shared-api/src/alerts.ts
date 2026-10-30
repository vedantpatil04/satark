import { apiClient } from "./client";
import type { Alert } from "@satark/shared-types";

export const alertsApi = {
  list: (sessionId?: string, isAcknowledged?: boolean) => {
    let endpoint = "/alerts";
    const params = new URLSearchParams();
    if (sessionId) params.append("session_id", sessionId);
    if (isAcknowledged !== undefined) params.append("is_acknowledged", String(isAcknowledged));
    if (params.toString()) endpoint += `?${params.toString()}`;
    return apiClient<Alert[]>(endpoint);
  },

  acknowledge: (alertId: string, proctor_notes?: string) =>
    apiClient<Alert>(`/alerts/${alertId}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ proctor_notes }),
    }),
};

