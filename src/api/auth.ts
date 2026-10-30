import { apiClient } from "./client";

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  role: "teacher" | "student";
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserResponse;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  role?: "teacher" | "student";
  teacher_provisioning_key?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface WsTicketResponse {
  ticket: string;
  expires_in: number;
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    apiClient<UserResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  login: (payload: LoginPayload) =>
    apiClient<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getMe: () => apiClient<UserResponse>("/auth/me"),

  getWsTicket: (channel?: string) =>
    apiClient<WsTicketResponse>("/auth/ws-ticket", {
      method: "POST",
      body: JSON.stringify({ channel }),
    }),
};
