import React from 'react';
import { useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useMyHotels } from '../api/hooks.js';
import { useSession } from '../store/session.js';
import { Dialog } from '../components/ui/index.jsx';
import { adminApi, adminKeys, displayError } from './api.js';

const retry = (count, error) => error.status >= 400 && error.status < 500 ? false : count < 1;
const pendingParams = { status: 'pending', page: 1, limit: 100 };
const rowsOf = (data) => data?.items || data?.data || (Array.isArray(data) ? data : []);
const notificationKey = (userId, hotelId) => `hotel-core-hotel-alerts:${userId}:${hotelId}`;
const readHotelAlerts = (userId, hotelId) => {
  try {
    const stored = JSON.parse(localStorage.getItem(notificationKey(userId, hotelId)) || '{}');
    return {
      initialized: Boolean(stored.initialized),
      orderIds: new Set(Array.isArray(stored.orderIds) ? stored.orderIds.map(String) : []),
    };
  } catch {
    return { initialized: false, orderIds: new Set() };
  }
};
const saveHotelAlerts = (userId, hotelId, state) => {
  try {
    localStorage.setItem(notificationKey(userId, hotelId), JSON.stringify({
      initialized: state.initialized,
      orderIds: [...state.orderIds].slice(-500),
    }));
  } catch {
    // Notification deduplication falls back to this component's memory when storage is unavailable.
  }
};

export default function HotelOrderNotifications({ memberships }) {
  const hotelsQuery = useMyHotels();
  const userId = useSession((state) => state.user?.id);
  const membershipIds = new Set((memberships || []).map((hotel) => String(hotel.hotel_id)));
  const hotels = (hotelsQuery.data || []).filter((hotel) => (
    membershipIds.has(String(hotel.hotel_id)) && hotel.status === 'active'
  ));
  const queries = useQueries({
    queries: hotels.map((hotel) => ({
      queryKey: adminKeys.orderNotifications(hotel.hotel_id),
      queryFn: () => adminApi.orders(hotel.hotel_id, pendingParams),
      staleTime: 0,
      refetchInterval: 15000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      retry,
    })),
  });
  const [alerts, setAlerts] = React.useState([]);
  const seen = React.useRef(new Map());
  const closeFirst = React.useCallback(() => setAlerts((current) => current.slice(1)), []);

  React.useEffect(() => {
    const found = [];
    queries.forEach((query, index) => {
      if (!query.data || !query.isFetchedAfterMount) return;
      const hotel = hotels[index];
      const hotelId = String(hotel.hotel_id);
      const stateKey = `${userId}:${hotelId}`;
      if (!seen.current.has(stateKey)) {
        seen.current.set(stateKey, readHotelAlerts(userId, hotelId));
      }
      const state = seen.current.get(stateKey);
      if (!state.initialized) {
        for (const order of rowsOf(query.data)) state.orderIds.add(String(order.id));
        state.initialized = true;
        const count = Number(query.data?.meta?.total ?? rowsOf(query.data).length);
        if (count > 0) found.push({ hotelId: hotel.hotel_id, hotelName: hotel.name, count });
        saveHotelAlerts(userId, hotelId, state);
        return;
      }

      let newCount = 0;
      for (const order of rowsOf(query.data)) {
        const orderId = String(order.id);
        if (state.orderIds.has(orderId)) continue;
        state.orderIds.add(orderId);
        newCount += 1;
      }
      saveHotelAlerts(userId, hotelId, state);
      if (newCount > 0) found.push({ hotelId: hotel.hotel_id, hotelName: hotel.name, count: newCount, isNew: true });
    });
    if (found.length) setAlerts((current) => [...current, ...found]);
  }, [hotels, queries, userId]);

  const failed = queries.find((query) => query.isError);
  const active = alerts[0];
  return <>
    {hotelsQuery.isError && <div className="admin-notification-error" role="alert">
      <span>Order notifications are unavailable: {displayError(hotelsQuery.error)}</span>
      <button type="button" className="text-button" onClick={() => hotelsQuery.refetch()}>Retry</button>
    </div>}
    {failed && <div className="admin-notification-error" role="alert">
      <span>Order notifications for one of your hotels are unavailable: {displayError(failed.error)}</span>
      <button type="button" className="text-button" onClick={() => failed.refetch()}>Retry</button>
    </div>}
    {active && <Dialog title={active.isNew ? 'New pending orders' : 'Pending orders'} onClose={closeFirst} className="admin-order-notification">
      <p><strong>{active.hotelName}</strong> has <strong>{active.count} {active.isNew ? 'new ' : ''}pending {active.count === 1 ? 'order' : 'orders'}</strong>.</p>
      <p>Review the pending orders and mark them completed or cancel them.</p>
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={closeFirst}>Dismiss</button>
        <Link className="button button-primary" to={`/admin/${active.hotelId}/orders`} onClick={closeFirst}>Review order</Link>
      </div>
    </Dialog>}
  </>;
}
