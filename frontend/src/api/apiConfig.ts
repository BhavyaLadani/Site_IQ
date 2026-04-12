/**
 * Centralized API Configuration
 * ==============================
 * Single source of truth for all API endpoints and helpers.
 * All components should import from here instead of hardcoding URLs.
 */

// Base URL — can be overridden via environment variable
export const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8001';

/**
 * Helper: GET request with error handling
 */
export async function apiGet<T = any>(
  path: string,
  options?: { signal?: AbortSignal; headers?: Record<string, string> }
): Promise<T> {
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    signal: options?.signal,
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.message || body.detail || `API GET ${path} failed (${resp.status})`);
  }
  return resp.json();
}

/**
 * Helper: POST request with error handling
 */
export async function apiPost<T = any>(
  path: string,
  body: any,
  options?: { signal?: AbortSignal; headers?: Record<string, string> }
): Promise<T> {
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.message || data.detail || `API POST ${path} failed (${resp.status})`);
  }
  return resp.json();
}

/**
 * Helper: GET request with auth token
 */
export async function apiGetAuth<T = any>(
  path: string,
  token: string,
  options?: { signal?: AbortSignal }
): Promise<T> {
  return apiGet<T>(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Helper: POST request with auth token
 */
export async function apiPostAuth<T = any>(
  path: string,
  body: any,
  token: string,
  options?: { signal?: AbortSignal }
): Promise<T> {
  return apiPost<T>(path, body, {
    ...options,
    headers: { Authorization: `Bearer ${token}` },
  });
}
