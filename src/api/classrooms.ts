import { apiClient } from "./client";

export interface Classroom {
  id: string;
  teacher_id: string;
  title: string;
  subject_code?: string;
  description?: string;
  join_code: string;
  is_archived: boolean;
  created_at: string;
  enrolled_count?: number;
}

export interface EnrolledStudent {
  student_id: string;
  full_name: string;
  email: string;
  enrolled_at: string;
}

export const classroomsApi = {
  list: () => apiClient<Classroom[]>("/classrooms"),

  // Backward-compatible alias for enrolled classrooms list
  listEnrolled: () => apiClient<Classroom[]>("/classrooms"),

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

  removeStudent: (classroomId: string, studentId: string) =>
    apiClient<{ message: string; student_id: string }>(
      `/classrooms/${classroomId}/students/${studentId}`,
      { method: "DELETE" }
    ),

  leave: (classroomId: string) =>
    apiClient<{ message: string; classroom_id: string }>(
      `/classrooms/${classroomId}/leave`,
      { method: "DELETE" }
    ),
};
