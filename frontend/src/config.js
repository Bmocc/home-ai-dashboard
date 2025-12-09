const DEFAULT_API_BASE_URL = 'http://localhost:8000'

const getRuntimeBaseUrl = () => {
  if (typeof window !== 'undefined' && window.__ENV__?.API_BASE_URL) {
    return window.__ENV__.API_BASE_URL
  }
  const envUrl = import.meta.env?.VITE_API_BASE_URL?.trim()
  return envUrl || DEFAULT_API_BASE_URL
}

export const API_BASE_URL = getRuntimeBaseUrl().replace(/\/$/, '')
