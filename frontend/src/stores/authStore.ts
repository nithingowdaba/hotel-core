import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'PLATFORM_ADMIN' | 'HOTEL_ADMIN' | 'CUSTOMER'

export interface AuthUser {
  id: number
  name: string
  email: string
  role: UserRole
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (user: AuthUser, token: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: (user, token) => {
        localStorage.setItem('hc_token', token)
        set({ user, token, isAuthenticated: true })
      },
      clearAuth: () => {
        localStorage.removeItem('hc_token')
        set({ user: null, token: null, isAuthenticated: false })
      },
    }),
    {
      name: 'hc-auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    },
  ),
)
