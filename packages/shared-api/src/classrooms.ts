import { apiClient } from "./client";
import type { Classroom, EnrolledStudent } from "@satark/shared-types";

export const classroomsApi = {
  list: () => apiClient<Classroom[]>("/classrooms"),

  get: (id: string) => apiClient<Classroom>(`/classrooms/${id}`),

  create: (payload: { title: string; subject_code?: string; description?: string }) =>
    apiClient<Classroom>("/classrooms", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  join: (join_code: string) =>
    apiClient<Classroom>("/classrooms/join", {
      method: "POST",
      body: JSON.stringify({ join_code }),
    }),

  getEnrolledStudents: (classroomId: string) =>
    apiClient<EnrolledStudent[]>(`/classrooms/${classroomId}/students`),

  sendAnnouncement: (classroomId: string, payload: { title: string; message: string }) =>
    apiClient<{ classroom_id: string; title: string; message: string; recipients_count: number }>(
      `/classrooms/${classroomId}/announcements`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),
};

