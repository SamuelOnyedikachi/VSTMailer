export class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export async function api(path: string, options: RequestInit = {}) {
    const response = await fetch(`/api${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, credentials: 'same-origin', cache: 'no-store' });
    let data;
    try {
        data = await response.json();
    }
    catch {
        throw new ApiError(response.status, 'The service returned an unreadable response. Check that the API is running.');
    }
    if (!response.ok)
        throw new ApiError(response.status, data.error || 'The request could not be completed.');
    return data;
}
export const post = (path: string, body: unknown = {}, headers: Record<string, string> = {}) => api(path, { method: 'POST', body: JSON.stringify(body), headers });
export type Row = Record<string, any>;
export const number = (value: number | string = 0) => new Intl.NumberFormat('en').format(Number(value));
export const date = (value: string) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
