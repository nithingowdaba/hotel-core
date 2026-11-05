import { useSession } from '../store/session.js';
export class ApiError extends Error { constructor({ code = 'UNKNOWN', status = 0, message = 'Something went wrong. Please try again.', details = [] } = {}) { super(message); this.name = 'ApiError'; Object.assign(this, { code, status, details }); } }
export async function apiRequest(path, options = {}) {
  const token = useSession.getState().token;
  let response;
  try { response = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } }); }
  catch { throw new ApiError({ code: 'OFFLINE', message: 'You appear to be offline. Check your connection and try again.' }); }
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (response.status === 401 && token) { useSession.getState().clearSession(); const next = `${window.location.pathname}${window.location.search}`; window.location.assign(`/login?next=${encodeURIComponent(next)}`); }
  if (!response.ok || payload.success === false) throw new ApiError({ code: payload.error?.code || 'REQUEST_FAILED', status: response.status, message: payload.error?.message || 'Something went wrong. Please try again.', details: payload.error?.details || [] });
  return payload.meta && Array.isArray(payload.data) ? { items: payload.data, meta: payload.meta } : payload.data;
}
export const api = {
  hotels: (params = {}) => apiRequest(`/hotels?${new URLSearchParams(params)}`), hotel: (id) => apiRequest(`/hotels/${id}`), menu: (id) => apiRequest(`/hotels/${id}/menu`), me: () => apiRequest('/auth/me'), login: (data) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(data) }), register: (data) => apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(data) }), myOrders: (params = {}) => apiRequest(`/me/orders?${new URLSearchParams(params)}`), order: (id) => apiRequest(`/me/orders/${id}`), cancel: (id) => apiRequest(`/me/orders/${id}/cancel`, { method: 'PATCH', body: JSON.stringify({}) }), placeOrder: (hotelId, data) => apiRequest(`/hotels/${hotelId}/orders`, { method: 'POST', body: JSON.stringify(data) }),
};
