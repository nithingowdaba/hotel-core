import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import { useSession } from '../store/session.js';
const no4xx = (count, error) => error.status >= 400 && error.status < 500 ? false : count < 2;
export const keys = { hotels: (p) => ['hotels', p], hotel: (id) => ['hotel', id], menu: (id) => ['menu', id], me: ['me'], myHotels: ['my-hotels'], orders: (p) => ['orders', p], order: (id) => ['order', id] };
export const useHotels = (params) => useQuery({
  queryKey: keys.hotels(params),
  queryFn: () => api.hotels(params),
  staleTime: 60000,
  retry: no4xx,
  placeholderData: (previousData) => previousData,
});
export const useHotel = (id) => useQuery({ queryKey: keys.hotel(id), queryFn: () => api.hotel(id), enabled: Boolean(id), retry: no4xx });
export const useMenu = (id) => useQuery({ queryKey: keys.menu(id), queryFn: () => api.menu(id), enabled: Boolean(id), staleTime: 30000, retry: no4xx });
export const useMe = () => {
  const token = useSession((state) => state.token);
  return useQuery({ queryKey: keys.me, queryFn: api.me, enabled: Boolean(token), retry: no4xx });
};
export const useMyHotels = () => useQuery({ queryKey: keys.myHotels, queryFn: api.myHotels, retry: no4xx });
export const useMyOrders = (params) => useQuery({ queryKey: keys.orders(params), queryFn: () => api.myOrders(params), retry: no4xx });
export const useOrder = (id) => useQuery({ queryKey: keys.order(id), queryFn: () => api.order(id), enabled: Boolean(id), retry: no4xx });
export function useLogin() { const qc = useQueryClient(); return useMutation({ mutationFn: api.login, onSuccess: (data) => { useSession.getState().setSession(data.token, data.user); qc.setQueryData(keys.me, data.user); } }); }
export const useRegister = () => useMutation({ mutationFn: api.register });
export function usePlaceOrder() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ hotelId, body }) => api.placeOrder(hotelId, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: ['customer-order-notifications'] }); } }); }
export function useCancelOrder() { const qc = useQueryClient(); return useMutation({ mutationFn: api.cancel, onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: keys.order(id) }); } }); }
export async function prefetchHotel(queryClient, id) { await Promise.all([queryClient.prefetchQuery({ queryKey: keys.hotel(id), queryFn: () => api.hotel(id) }), queryClient.prefetchQuery({ queryKey: keys.menu(id), queryFn: () => api.menu(id), staleTime: 30000 })]); }
