import { ClientFallbackError, handleClientSandboxRequest } from './clientSandboxFallback.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let backendUnreachable = false;

export function isStaticPreviewFallbackActive(): boolean {
  return backendUnreachable;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  if (backendUnreachable) {
    try {
      return await handleClientSandboxRequest<T>(path, options);
    } catch (err) {
      if (err instanceof ClientFallbackError) {
        throw new ApiError(err.status, err.message);
      }
      throw err;
    }
  }

  const { token, headers, ...rest } = options;
  const reqHeaders = new Headers(headers);
  if (!reqHeaders.has('Content-Type') && rest.body) {
    reqHeaders.set('Content-Type', 'application/json');
  }
  if (token) {
    reqHeaders.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: reqHeaders,
    });
  } catch {
    backendUnreachable = true;
    try {
      return await handleClientSandboxRequest<T>(path, options);
    } catch (err) {
      if (err instanceof ClientFallbackError) throw new ApiError(err.status, err.message);
      throw err;
    }
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  // If a static host returned an HTML 404 (or 405) for an /api/* endpoint, switch gracefully to client fallback
  if (!isJson && (res.status === 404 || res.status === 405)) {
    backendUnreachable = true;
    try {
      return await handleClientSandboxRequest<T>(path, options);
    } catch (err) {
      if (err instanceof ClientFallbackError) throw new ApiError(err.status, err.message);
      throw err;
    }
  }

  const text = await res.text();
  let json: Record<string, unknown> = {};
  let parseFailed = false;
  if (text) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        json = parsed as Record<string, unknown>;
      } else {
        parseFailed = true;
      }
    } catch {
      parseFailed = true;
      json = {};
    }
  }

  if (!res.ok) {
    const message =
      (typeof json.error === 'string' && json.error) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  if (parseFailed && res.status !== 204) {
    throw new ApiError(502, 'Unexpected non-JSON response from API server.');
  }

  return json as T;
}
