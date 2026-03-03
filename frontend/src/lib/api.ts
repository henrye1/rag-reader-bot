/**
 * Thin fetch wrapper for calling the Python FastAPI backend API.
 */

/** General-purpose fetch supporting all HTTP methods + query params. */
export async function apiFetch<T = Record<string, unknown>>(
  endpoint: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: Record<string, unknown> | FormData;
    params?: Record<string, string>;
  },
): Promise<{ data: T | null; error: { message: string } | null }> {
  try {
    const method = options?.method ?? 'GET';
    let url = `/api/${endpoint}`;

    if (options?.params) {
      const qs = new URLSearchParams(options.params).toString();
      if (qs) url += `?${qs}`;
    }

    const isFormData = options?.body instanceof FormData;
    const hasBody = options?.body && (method === 'POST' || method === 'PUT');

    const response = await fetch(url, {
      method,
      ...(hasBody
        ? isFormData
          ? { body: options.body }
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(options.body),
            }
        : {}),
    });

    // DELETE may return 204 with no body
    if (response.status === 204) {
      return { data: null, error: null };
    }

    const data = await response.json();

    if (!response.ok) {
      return { data: null, error: { message: data.error || `Request failed (${response.status})` } };
    }

    return { data, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { data: null, error: { message } };
  }
}

/** Backward-compatible POST wrapper. */
export async function apiCall<T = Record<string, unknown>>(
  endpoint: string,
  body: Record<string, unknown> | FormData,
): Promise<{ data: T | null; error: { message: string } | null }> {
  return apiFetch<T>(endpoint, { method: 'POST', body });
}
