export class ApiError extends Error {
  details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.details = details;
  }
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error ?? "Une erreur est survenue.", data.details);
  }
  return data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  return handle<T>(res);
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

export async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handle<T>(res);
}

export async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handle<T>(res);
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE", credentials: "same-origin" });
  return handle<T>(res);
}
