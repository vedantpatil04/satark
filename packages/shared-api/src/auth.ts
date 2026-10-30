import { apiClient } from "./client";
import type { UserResponse, TokenResponse, RegisterPayload, LoginPayload, WsTicketResponse } from "@satark/shared-types";

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

  getWsTicket: (channel: string = "general") =>
    apiClient<WsTicketResponse>("/auth/ws-ticket", {
      method: "POST",
      body: JSON.stringify({ channel }),
    }),
};

