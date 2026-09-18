const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

export type CloudFile = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  status: "uploaded" | "indexing" | "ready" | "failed" | "deleted";
  ai_category: string | null;
  ai_summary: string | null;
  created_at: string;
};

export type SearchHit = {
  file_id: string;
  name: string;
  score: number;
  snippet: string | null;
};

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? "Request failed");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  return request<{ access_token: string; refresh_token: string }>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string) {
  await request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return login(email, password);
}

export function listFiles(token: string) {
  return request<CloudFile[]>("/files", {}, token);
}

export function searchFiles(token: string, query: string) {
  const params = new URLSearchParams({ q: query });
  return request<SearchHit[]>(`/search?${params}`, {}, token);
}

export async function uploadFile(token: string, file: File) {
  const body = new FormData();
  body.append("upload", file);
  return request<CloudFile>("/files", { method: "POST", body }, token);
}
