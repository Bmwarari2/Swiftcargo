import axios from 'axios'

const BASE_URL =
  import.meta.env.VITE_API_URL || 'https://swiftcargo-production.up.railway.app'

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// ── Session helpers ────────────────────────────────────────────────────────────
// Use sessionStorage as primary (survives page navigation within the same tab)
// with a memory fallback for sandboxed environments where storage is blocked.
const memStore = {}

function storageSet(key, value) {
  try {
    sessionStorage.setItem(key, value)
    localStorage.setItem(key, value)   // also write to localStorage for persistence
  } catch (_) {
    memStore[key] = value              // fallback: in-memory (survives navigation, not refresh)
  }
}

function storageGet(key) {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || null
  } catch (_) {
    return memStore[key] || null
  }
}

function storageRemove(key) {
  try {
    sessionStorage.removeItem(key)
    localStorage.removeItem(key)
  } catch (_) {
    delete memStore[key]
  }
}

export function saveSession(token, user) {
  storageSet('sc_token', token)
  storageSet('sc_user', JSON.stringify(user))
}

export function getSession() {
  const token = storageGet('sc_token')
  try {
    const user = JSON.parse(storageGet('sc_user') || 'null')
    return { token, user }
  } catch {
    return { token, user: null }
  }
}

export function clearSession() {
  storageRemove('sc_token')
  storageRemove('sc_user')
}

export function isLoggedIn() {
  return !!storageGet('sc_token')
}

// ── Request interceptor: attach Bearer token ──────────────────────────────────
api.interceptors.request.use((config) => {
  const token = storageGet('sc_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor: handle 401 + unwrap errors ─────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthRoute = error.config?.url?.includes('/auth/')
    if (error.response?.status === 401 && !isAuthRoute) {
      clearSession()
      window.location.href = '/login'
    }

    let message = 'Something went wrong'
    const data = error.response?.data
    if (data) {
      if (typeof data === 'string' && data.length < 200) {
        message = data
      } else if (typeof data === 'object' && data.message) {
        message = data.message
      }
    } else if (error.message) {
      message = error.message
    }

    return Promise.reject(new Error(message))
  }
)

export default api
