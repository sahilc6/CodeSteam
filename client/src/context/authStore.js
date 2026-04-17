import { create } from 'zustand'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

// Axios instance with auth header auto-inject
const api = axios.create({ baseURL: API })
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const useAuthStore = create((set, get) => ({
  user:    null,
  token:   localStorage.getItem('token'),
  loading: false,
  error:   null,

  // Restore session on app load
  init: async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const { data } = await api.get('/api/auth/me')
      set({ user: data, token })
      localStorage.setItem('username', data.username)
    } catch {
      localStorage.removeItem('token')
      set({ token: null, user: null })
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.post('/api/auth/login', { email, password })
      localStorage.setItem('token', data.token)
      localStorage.setItem('username', data.user.username)
      set({ user: data.user, token: data.token, loading: false })
      return true
    } catch (err) {
      set({ error: err.response?.data?.error || 'Login failed', loading: false })
      return false
    }
  },

  register: async (username, email, password) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.post('/api/auth/register', { username, email, password })
      localStorage.setItem('token', data.token)
      localStorage.setItem('username', data.user.username)
      set({ user: data.user, token: data.token, loading: false })
      return true
    } catch (err) {
      set({ error: err.response?.data?.error || 'Registration failed', loading: false })
      return false
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    set({ user: null, token: null })
  },

  clearError: () => set({ error: null }),
}))

export default useAuthStore
