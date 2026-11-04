// ── Shared API types ──────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: true
  data: T
}

export interface PaginatedResponse<T> {
  success: true
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
    details: Array<{ field?: string; message: string }>
  }
}

// ── Domain types ─────────────────────────────────────────────────────────────

export interface Hotel {
  id: number
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MenuItem {
  id: number
  hotel_id: number
  name: string
  description: string | null
  price_paise: number
  is_available: boolean
  created_at: string
  updated_at: string
}

export interface Order {
  id: number
  hotel_id: number
  customer_id: number
  status: 'pending' | 'completed'
  total_paise: number
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: number
  order_id: number
  menu_item_id: number
  name_snapshot: string
  price_snapshot_paise: number
  quantity: number
}

export interface User {
  id: number
  name: string
  email: string
  role: 'PLATFORM_ADMIN' | 'CUSTOMER'
}
