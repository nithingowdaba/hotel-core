import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
const no4xx = (count, error) => error.status >= 400 && error.status < 500 ? false : count < 2;
export const keys = { hotels: (p) => ['hotels', p], hotel: (id) => ['hotel', id], menu: (id) => ['menu', id], me: ['me'], orders: (p) => ['orders', p], order: (id) => ['order', id] };
export const useHotels = (params) => useQuery({ queryKey: keys.hotels(params), queryFn: () => api.hotels(params), staleTime: 60000, retry: no4xx });
export const useHotel = (id) => useQuery({ queryKey: keys.hotel(id), queryFn: () => api.hotel(id), enabled: Boolean(id), retry: no4xx });
export const useMenu = (id) => useQuery({ queryKey: keys.menu(id), queryFn: () => api.menu(id), enabled: Boolean(id), staleTime: 30000, retry: no4xx });
export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.me, retry: no4xx });
export const useMyOrders = (params) => useQuery({ queryKey: keys.orders(params), queryFn: () => api.myOrders(params), retry: no4xx });
export const useOrder = (id) => useQuery({ queryKey: keys.order(id), queryFn: () => api.order(id), enabled: Boolean(id), retry: no4xx });
export function useLogin() { const qc = useQueryClient(); return useMutation({ mutationFn: api.login, onSuccess: (data) => { import('../store/session.js').then(({ useSession }) => useSession.getState().setSession(data.token, data.user)); qc.setQueryData(keys.me, data.user); } }); }
export const useRegister = () => useMutation({ mutationFn: api.register });
export function usePlaceOrder() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ hotelId, body }) => api.placeOrder(hotelId, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }) }); }
export function useCancelOrder() { const qc = useQueryClient(); return useMutation({ mutationFn: api.cancel, onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: keys.order(id) }); } }); }
export async function prefetchHotel(queryClient, id) { await Promise.all([queryClient.prefetchQuery({ queryKey: keys.hotel(id), queryFn: () => api.hotel(id) }), queryClient.prefetchQuery({ queryKey: keys.menu(id), queryFn: () => api.menu(id), staleTime: 30000 })]); }
