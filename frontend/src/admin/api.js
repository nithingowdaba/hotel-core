import { apiRequest } from '../api/client.js';

const enc = (value) => encodeURIComponent(String(value));
export const adminApi = {
  hotel: (id) => apiRequest(`/hotels/${enc(id)}`),
  menu: (id) => apiRequest(`/hotels/${enc(id)}/menu`),
  orders: (id, params) => apiRequest(`/hotels/${enc(id)}/orders?${new URLSearchParams(params)}`),
  order: (hotelId, orderId) => apiRequest(`/hotels/${enc(hotelId)}/orders/${enc(orderId)}`),
  updateOrder: (hotelId, orderId) => apiRequest(`/hotels/${enc(hotelId)}/orders/${enc(orderId)}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }),
  cancelOrder: (hotelId, orderId) => apiRequest(`/hotels/${enc(hotelId)}/orders/${enc(orderId)}/cancel`, { method: 'PATCH', body: JSON.stringify({}) }),
  createItem: (hotelId, body) => apiRequest(`/hotels/${enc(hotelId)}/menu-items`, { method: 'POST', body: JSON.stringify(body) }),
  updateItem: (hotelId, itemId, body) => apiRequest(`/hotels/${enc(hotelId)}/menu-items/${enc(itemId)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  availability: (hotelId, itemId, value) => apiRequest(`/hotels/${enc(hotelId)}/menu-items/${enc(itemId)}/availability`, { method: 'PATCH', body: JSON.stringify({ is_available: value }) }),
  updateHotel: (hotelId, body) => apiRequest(`/hotels/${enc(hotelId)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resubmitHotel: (hotelId) => apiRequest(`/hotels/${enc(hotelId)}/resubmit`, { method: 'POST', body: JSON.stringify({}) }),
  dailySales: (hotelId, date) => apiRequest(`/hotels/${enc(hotelId)}/reports/daily-sales?${new URLSearchParams({ date })}`),
  topItems: (hotelId, params) => apiRequest(`/hotels/${enc(hotelId)}/reports/top-selling-items?${new URLSearchParams(params)}`),
  hotels: (params = {}) => apiRequest(`/platform/hotels?${new URLSearchParams(params)}`),
  updatePlatformHotel: (id, body) => apiRequest(`/platform/hotels/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  approveHotel: (id) => apiRequest(`/platform/hotels/${enc(id)}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  rejectHotel: (id, reason) => apiRequest(`/platform/hotels/${enc(id)}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  admins: (id, params = {}) => apiRequest(`/platform/hotels/${enc(id)}/admins?${new URLSearchParams(params)}`),
  addAdmin: (id, body) => apiRequest(`/platform/hotels/${enc(id)}/admins`, { method: 'POST', body: JSON.stringify(body) }),
  removeAdmin: (id, userId) => apiRequest(`/platform/hotels/${enc(id)}/admins/${enc(userId)}`, { method: 'DELETE' }),
  createHotel: (body) => apiRequest('/platform/hotels', { method: 'POST', body: JSON.stringify(body) }),
  metrics: () => apiRequest('/platform/metrics'),
};

export const adminKeys = {
  hotel: (id) => ['admin', 'hotel', String(id)],
  menu: (id) => ['admin', 'menu', String(id)],
  orders: (id, params) => ['admin', 'orders', String(id), params],
  order: (hotelId, orderId) => ['admin', 'order', String(hotelId), String(orderId)],
  daily: (id, date) => ['admin', 'daily', String(id), date],
  top: (id, params) => ['admin', 'top', String(id), params],
  hotels: (params) => ['platform', 'hotels', params],
  hotelAdmins: (id, params) => ['platform', 'admins', String(id), params],
  metrics: ['platform', 'metrics'],
};

export function displayError(error) {
  const map = {
    FORBIDDEN: 'You do not have permission to make this change.',
    HOTEL_SUSPENDED: 'This hotel is suspended by the platform. Changes are disabled.',
    MENU_ITEM_EXISTS: 'An item with this name already exists in that category.',
    INVALID_STATUS_TRANSITION: 'This order has already changed. Its latest status has been refreshed.',
    CANCELLATION_NOT_ALLOWED: 'This order can no longer be cancelled. Its latest status has been refreshed.',
    SLUG_IN_USE: 'That hotel slug is already in use. Choose another one.',
    ALREADY_HOTEL_ADMIN: 'This user is already an administrator of this hotel.',
    EMAIL_IN_USE: 'An account with this email already exists.',
    HOTEL_NOT_FOUND: 'This hotel is unavailable or suspended.',
  };
  return map[error?.code] || error?.message || 'Something went wrong. Please try again.';
}

export function fieldErrors(error) {
  const result = {};
  for (const detail of error?.details || []) {
    const key = detail.path || detail.param || detail.field;
    if (key) result[key] = detail.msg || detail.message || 'Check this value.';
  }
  return result;
}

export function isSuspended(error) {
  return ['HOTEL_SUSPENDED', 'HOTEL_NOT_FOUND'].includes(error?.code) || error?.status === 403;
}
