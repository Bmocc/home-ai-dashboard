const DEFAULT_API_BASE_URL = 'http://localhost:8000'

// VITE_API_BASE_URL comes from .env/.env.local so phones can target your LAN IP.
const envUrl = import.meta.env?.VITE_API_BASE_URL?.trim()
export const API_BASE_URL = (envUrl || DEFAULT_API_BASE_URL).replace(/\/$/, '')
