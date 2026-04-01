import axios from 'axios'

const BASE_URL =
  import.meta.env.VITE_API_URL || 'https://swiftcargo-production.up.railway.app'

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// ── Session helpers ────────────────────────────────────────────────────────────
export function saveSession(token, user) {
  localStorage.setItem('sc_token', token)
  localStorage.setItem('sc_user', JSON.stringify(user))
}

export function getSession() {
  const token = localStorage.getItem('sc_token')
  try {
    const user = JSON.parse(localStorage.getItem('sc_user') || 'null')
    return { token, user }
  } catch {
    return { token, user: null }
  }
}

export function clearSession() {
  localStorage.removeItem('sc_token')
  localStorage.removeItem('sc_user')
}

export function isLoggedIn() {
  return !!localStorage.getItem('sc_token')
}

// ── Request interceptor: attach Bearer token ──────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sc_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor: handle 401 + unwrap errors ─────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't redirect for /auth/ routes (login, register, me, etc.)
    // so that the calling code (e.g. Login.jsx) can handle the error itself.
    const isAuthRoute = error.config?.url?.includes('/auth/')
    if (error.response?.status === 401 && !isAuthRoute) {
      clearSession()
      window.location.href = '/login'
    }

    // Safely extract the error message — the response body may be plain text
    // (e.g. from express-rate-limit before our JSON handler fix) or JSON.
    let message = 'Something went wrong'
    const data = error.response?.data
    if (data) {
      if (typeof data === 'string' && data.length < 200) {
        // Plain-text body (e.g. old rate-limit response)
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
