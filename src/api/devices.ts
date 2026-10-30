import { apiClient } from "./client";

export interface Device {
  id: string;
  hardware_uuid: string;
  hostname?: string;
  os_type: "windows" | "linux" | "macos";
  os_version?: string;
  agent_version: string;
  owner_user_id?: string;
  last_heartbeat_at?: string;
  status: "connected" | "inactive" | "offline" | "disconnected";
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  device_id: string;
  student_id: string;
  classroom_id?: string;
  session_id: string;
  mode: "exam" | "focus";
  event_category: string;
  event_type: string;
  source: "agent" | "server" | "demo";
  severity: "low" | "medium" | "high" | "critical";
  occurred_at: string;
  received_at: string;
  details: Record<string, any>;
}

export const devicesApi = {
  list: () => apiClient<Device[]>("/devices"),

  get: (id: string) => apiClient<Device>(`/devices/${id}`),

  getEvents: (deviceId: string) => apiClient<ActivityEvent[]>(`/devices/${deviceId}/events`),

  getPairingCode: () =>
    apiClient<{ pairing_code: string; expires_in_seconds: number }>("/devices/pairing-code", {
      method: "POST",
    }),

  revoke: (deviceId: string) =>
    apiClient<{ message: string; device_id: string }>(`/devices/${deviceId}/revoke`, {
      method: "POST",
    }),
};
