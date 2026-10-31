// The only place the frontend talks to the backend. Same-origin: Next rewrites /api/* to Django.

export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors: FieldErrors = {},
  ) {
    super(message);
  }
}

function cookie(name: string) {
  if (typeof document === "undefined") return undefined;
  return document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.split("=")[1];
}

let csrfReady: Promise<unknown> | null = null;
async function ensureCsrf() {
  if (cookie("csrftoken")) return;
  csrfReady ??= fetch("/api/auth/csrf/", { credentials: "include" }).finally(() => (csrfReady = null));
  await csrfReady;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(params?: Query) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const unsafe = method !== "GET";
  if (unsafe) await ensureCsrf();
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...(unsafe && { "X-CSRFToken": decodeURIComponent(cookie("csrftoken") ?? "") }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? "Something went wrong.", e?.field_errors ?? {});
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>("GET", path + qs(params)),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: (path: string) => request<void>("DELETE", path),
};
