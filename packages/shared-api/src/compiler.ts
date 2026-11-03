import { apiClient } from "./client";

export type SupportedLanguage = "c" | "cpp" | "java" | "python";

export interface SetupGuide {
  title: string;
  description: string;
  quick_command: string;
  steps: string[];
  verification_command: string;
}

export interface RuntimeInfo {
  name: string;
  language: SupportedLanguage;
  is_available: boolean;
  version: string | null;
  binary_path: string | null;
  error_message: string | null;
  setup_guide?: SetupGuide | null;
}

export interface IsolationInfo {
  execution_model: string;
  memory_limit_mb: number;
  timeout_seconds: number;
  filesystem_isolation: string;
  network_isolation: string;
  honesty_notice: string;
}

export interface CompilerStatus {
  status: "healthy" | "partial" | "unavailable";
  all_available: boolean;
  summary: string;
  runtimes: Record<SupportedLanguage, RuntimeInfo>;
  isolation_info: IsolationInfo;
}

export interface ExecuteCodeRequest {
  language: SupportedLanguage;
  code: string;
  stdin?: string;
  filename?: string;
}

export interface ExecuteCodeResponse {
  status:
    | "success"
    | "compilation_error"
    | "runtime_error"
    | "timed_out"
    | "memory_limit_exceeded"
    | "unavailable"
    | "system_error";
  stdout: string;
  stderr: string;
  compilation_error?: string | null;
  execution_time_ms: number;
  memory_kb?: number | null;
  exit_code?: number | null;
  security_enforced: Record<string, any>;
}

export interface PracticeFile {
  id: string;
  user_id: string;
  language: SupportedLanguage;
  filename: string;
  code: string;
  stdin?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SampleProgram {
  id: string;
  title: string;
  description: string;
  filename: string;
  language: SupportedLanguage;
  code: string;
  stdin?: string;
}

export const compilerApi = {
  getStatus: () => apiClient<CompilerStatus>("/compiler/status"),

  execute: (data: ExecuteCodeRequest) =>
    apiClient<ExecuteCodeResponse>("/compiler/execute", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getFiles: (language?: SupportedLanguage) =>
    apiClient<PracticeFile[]>(
      language ? `/compiler/files?language=${language}` : "/compiler/files"
    ),

  getFile: (fileId: string) => apiClient<PracticeFile>(`/compiler/files/${fileId}`),

  createFile: (data: {
    language: SupportedLanguage;
    filename: string;
    code?: string;
    stdin?: string;
  }) =>
    apiClient<PracticeFile>("/compiler/files", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateFile: (
    fileId: string,
    data: {
      filename?: string;
      code?: string;
      stdin?: string;
      is_active?: boolean;
    }
  ) =>
    apiClient<PracticeFile>(`/compiler/files/${fileId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteFile: (fileId: string) =>
    apiClient<void>(`/compiler/files/${fileId}`, {
      method: "DELETE",
    }),

  getSamples: (language: SupportedLanguage) =>
    apiClient<SampleProgram[]>(`/compiler/samples/${language}`),
};

