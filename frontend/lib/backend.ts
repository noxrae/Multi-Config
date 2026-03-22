const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000'

export const BACKEND_BASE_URL =
  process.env.PYTHON_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  DEFAULT_BACKEND_URL

export function backendUrl(path: string): string {
  return `${BACKEND_BASE_URL}${path}`
}

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(backendUrl(path), {
    ...init,
    cache: 'no-store',
  })
}

export async function backendJson<T>(path: string, init?: RequestInit): Promise<{ response: Response; data: T }> {
  const response = await backendFetch(path, init)
  const data = await response.json()
  return { response, data }
}
