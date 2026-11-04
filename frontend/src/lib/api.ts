import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// Request interceptor — attach JWT from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hc_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor — unwrap data or throw structured error
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const serverError = error.response?.data
    if (serverError && !serverError.success) {
      const appError = new Error(serverError.error?.message || 'An error occurred') as Error & {
        code: string
        details: unknown[]
        status: number
      }
      appError.code = serverError.error?.code || 'UNKNOWN_ERROR'
      appError.details = serverError.error?.details || []
      appError.status = error.response?.status || 500
      return Promise.reject(appError)
    }
    return Promise.reject(error)
  },
)

export default api
