import { apiClient, getApiBaseUrl } from "./client";
import type { ClassNote, ClassNoteUpdatePayload } from "@satark/shared-types";

export interface ListNotesParams {
  search?: string;
  category?: string;
  subject?: string;
  classroom_id?: string;
}

export const notesApi = {
  // List notes for a specific classroom
  listClassroomNotes: (classroomId: string, params?: ListNotesParams) => {
    const query = new URLSearchParams();
    if (params?.search) query.append("search", params.search);
    if (params?.category && params.category !== "all") query.append("category", params.category);
    if (params?.subject && params.subject !== "all") query.append("subject", params.subject);
    const qs = query.toString();
    return apiClient<ClassNote[]>(`/classrooms/${classroomId}/notes${qs ? `?${qs}` : ""}`);
  },

  // Get single note metadata
  getNote: (noteId: string) => apiClient<ClassNote>(`/notes/${noteId}`),

  // Teacher: Upload single note
  uploadNote: (
    classroomId: string,
    payload: {
      title: string;
      description?: string;
      subject?: string;
      category?: string;
      is_published?: boolean;
      file: File;
    }
  ) => {
    const formData = new FormData();
    formData.append("title", payload.title);
    if (payload.description) formData.append("description", payload.description);
    if (payload.subject) formData.append("subject", payload.subject);
    if (payload.category) formData.append("category", payload.category);
    formData.append("is_published", payload.is_published !== false ? "true" : "false");
    formData.append("file", payload.file);

    return apiClient<ClassNote>(`/classrooms/${classroomId}/notes`, {
      method: "POST",
      body: formData,
    });
  },

  // Teacher: Batch upload multiple files
  uploadBatchNotes: (
    classroomId: string,
    files: File[],
    options?: { category?: string; subject?: string; is_published?: boolean }
  ) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });
    if (options?.category) formData.append("category", options.category);
    if (options?.subject) formData.append("subject", options.subject);
    formData.append("is_published", options?.is_published !== false ? "true" : "false");

    return apiClient<ClassNote[]>(`/classrooms/${classroomId}/notes/batch`, {
      method: "POST",
      body: formData,
    });
  },

  // Teacher: Update metadata (title, category, is_published, etc.)
  updateNote: (noteId: string, payload: ClassNoteUpdatePayload) =>
    apiClient<ClassNote>(`/notes/${noteId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  // Teacher: Replace existing document file
  replaceNoteFile: (noteId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient<ClassNote>(`/notes/${noteId}/replace-file`, {
      method: "POST",
      body: formData,
    });
  },

  // Teacher: Delete note
  deleteNote: (noteId: string) =>
    apiClient<{ status: string; message: string; note_id: string }>(`/notes/${noteId}`, {
      method: "DELETE",
    }),

  // Student: List all published notes across enrolled classes
  listStudentEnrolledNotes: (params?: ListNotesParams) => {
    const query = new URLSearchParams();
    if (params?.search) query.append("search", params.search);
    if (params?.category && params.category !== "all") query.append("category", params.category);
    if (params?.classroom_id && params.classroom_id !== "all") query.append("classroom_id", params.classroom_id);
    const qs = query.toString();
    return apiClient<ClassNote[]>(`/notes/student/enrolled${qs ? `?${qs}` : ""}`);
  },

  // Direct URLs for media preview / download with auth token
  getPreviewUrl: (noteId: string): string => {
    const base = getApiBaseUrl();
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    return `${base}/notes/${noteId}/preview${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  },

  getDownloadUrl: (noteId: string): string => {
    const base = getApiBaseUrl();
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    return `${base}/notes/${noteId}/download${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  },

  // Fetch as blob for in-app download trigger
  downloadNoteBlob: async (noteId: string, filename: string): Promise<void> => {
    const base = getApiBaseUrl();
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    const url = `${base}/notes/${noteId}/download`;

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  },
};
