/** Typed fetch wrapper: attaches the Firebase ID token and turns errors into ApiError. */
import { firebaseAuth } from "./firebase";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public issues: { path: string; message: string }[] = [],
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const token = await firebaseAuth.currentUser?.getIdToken();
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    ...(init.signal ? { signal: init.signal } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(res.status, String(data.error ?? "Something went wrong."), String(data.code ?? "error"), (data.issues as ApiError["issues"]) ?? [], data.details);
  }
  return data as T;
}

export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
