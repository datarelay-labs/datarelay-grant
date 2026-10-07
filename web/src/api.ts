/** Same-origin authenticated product adapter; mutations are never blindly retried. */
export class ApiError extends Error {
 status: number;
 code: string;
 constructor(status: number, code: string) {
  super(code); this.name = 'ApiError'; this.status = status; this.code = code;
 }
}
let csrf = '';
export function setCsrf(value: string): void { csrf = value; }
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
 if (!/^\/[a-zA-Z0-9_/?=&.:%-]*$/.test(path) || path.startsWith('//') || path.includes('..')) throw new ApiError(0, 'INVALID_API_PATH');
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), 15000);
 try {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/v1' + path, {
   method, headers, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
   signal: controller.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, typeof data?.error?.code === 'string' ? data.error.code : 'REQUEST_FAILED');
  if (data === null) throw new ApiError(response.status, 'INVALID_SERVER_RESPONSE');
  return data as T;
 } finally { clearTimeout(timer); }
}
export function errorText(error: unknown): string {
 if (error instanceof ApiError) {
  if (error.status === 401) return 'Sign in again or complete MFA. No action was retried.';
  if (error.status === 409) return 'The request changed or is no longer actionable. Refresh before deciding. (' + error.code + ')';
  return error.code.replaceAll('_', ' ');
 }
 return 'The service could not be reached. Check the current request before retrying.';
}
