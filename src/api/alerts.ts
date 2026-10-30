import { apiClient } from "./client";

export interface Alert {
  id: string;
  session_id: string;
  student_id: string;
  device_id: string;
  primary_event_id?: string;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  evidence_summary?: Record<string, any>;
  is_acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  proctor_notes?: string;
  created_at: string;
}

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
