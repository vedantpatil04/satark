export const getApiBaseUrl = (): string => {
  // 1. Check for runtime custom API server override
  if (typeof window !== "undefined") {
    const custom = localStorage.getItem("custom_api_server");
    if (custom) {
      return custom.endsWith("/api/v1") ? custom : `${custom.replace(/\/+$/, "")}/api/v1`;
    }
  }

  // 2. Check build-time env variable
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl;
  }

  // 3. Fallback to current browser origin (if not mobile localhost)
  if (typeof window !== "undefined" && window.location) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${protocol}//${hostname}:8000/api/v1`;
    }
  }

  return envUrl || "http://127.0.0.1:8000/api/v1";
};

export interface RequestOptions extends RequestInit {
  token?: string | null;
}

export async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...customConfig } = options;

  const storedToken = token !== undefined ? token : (typeof window !== "undefined" ? localStorage.getItem("auth_token") : null);

  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (storedToken) {
    defaultHeaders["Authorization"] = `Bearer ${storedToken}`;
  }

  const config: RequestInit = {
    ...customConfig,
    headers: {
      ...defaultHeaders,
      ...(headers as Record<string, string>),
    },
  };

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  if (!config.signal && typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    config.signal = (AbortSignal as any).timeout(10000);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorDetail = "An unexpected error occurred";
    try {
      const errorJson = await response.json();
      if (typeof errorJson.detail === "string") {
        errorDetail = errorJson.detail;
      } else if (Array.isArray(errorJson.detail)) {
        errorDetail = errorJson.detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
      } else if (errorJson.message) {
        errorDetail = errorJson.message;
      }
    } catch {
      errorDetail = `${response.status} ${response.statusText}`;
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

