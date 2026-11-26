const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
    throw new ApiError(
      0,
      'Backend API server is unreachable. Check your internet connection or start the backend API.',
      err,
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let details: unknown;
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as { error?: string; message?: string; details?: unknown };
      message = payload.error || payload.message || message;
      details = payload.details;
    }
    throw new ApiError(response.status, message, details);
  }

  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
