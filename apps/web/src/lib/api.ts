import axios from 'axios'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Unwrap the backend's { success, data, meta } envelope so every existing
// call site that reads `res.data` keeps working unchanged.
api.interceptors.response.use((res) => {
  if (res.data && typeof res.data === 'object' && 'data' in res.data) {
    res.data = res.data.data
  }
  return res
})

// Refresh token on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null
      if (refreshToken) {
        try {
          const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
          // This bare axios call bypasses the `api` instance's unwrap
          // interceptor above, so it still sees the raw envelope.
          const { accessToken } = res.data.data
          localStorage.setItem('accessToken', accessToken)
          original.headers.Authorization = `Bearer ${accessToken}`
          return api(original)
        } catch {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  },
)
