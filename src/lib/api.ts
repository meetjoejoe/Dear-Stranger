export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;
  const reqHeaders = new Headers(headers);
  if (!reqHeaders.has('Content-Type') && rest.body) {
    reqHeaders.set('Content-Type', 'application/json');
  }
  if (token) {
    reqHeaders.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, {
    ...rest,
    headers: reqHeaders,
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = {};
    }
  }

  if (!res.ok) {
    const message =
      (typeof json.error === 'string' && json.error) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return json as T;
}
