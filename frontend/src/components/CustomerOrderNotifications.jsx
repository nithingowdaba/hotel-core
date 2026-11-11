import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useMe } from '../api/hooks.js';
import { useSession } from '../store/session.js';
import { formatDate } from '../lib/format.js';
import { Dialog } from './ui/index.jsx';

const retry = (count, error) => error.status >= 400 && error.status < 500 ? false : count < 1;
const rowsOf = (data) => data?.items || data?.data || (Array.isArray(data) ? data : []);
const readNotified = (userId) => {
  try {
    const stored = JSON.parse(localStorage.getItem(`hotel-core-customer-alerts:${userId}`) || '[]');
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
};
const saveNotified = (userId, notified) => {
  try {
    localStorage.setItem(`hotel-core-customer-alerts:${userId}`, JSON.stringify([...notified].slice(-500)));
  } catch {
    // Notification deduplication falls back to this component's memory when storage is unavailable.
  }
};

export default function CustomerOrderNotifications() {
  const profile = useMe();
  const authenticatedAt = useSession((state) => state.authenticatedAt);
  const userId = profile.data?.id;
  const isHotelAdmin = profile.data?.role === 'HOTEL_ADMIN' || Boolean(profile.data?.admin_of?.length);
  const query = useQuery({
    queryKey: ['customer-order-notifications', userId],
    queryFn: () => api.myOrders({ page: 1, limit: 100 }),
    enabled: Boolean(userId) && profile.data?.role !== 'PLATFORM_ADMIN' && !isHotelAdmin,
    staleTime: 0,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry,
  });
  const [alerts, setAlerts] = React.useState([]);
  const seen = React.useRef(new Map());
  const initialized = React.useRef(false);
  const notified = React.useRef({ userId: null, keys: new Set() });
  const closeFirst = React.useCallback(() => setAlerts((current) => current.slice(1)), []);

  React.useEffect(() => {
    if (!query.data || !query.isFetchedAfterMount) return;
    if (notified.current.userId !== userId) {
      notified.current = { userId, keys: readNotified(userId) };
      seen.current.clear();
      initialized.current = false;
      setAlerts([]);
    }
    const found = [];
    const orders = rowsOf(query.data);
    const initialSnapshot = !initialized.current;
    initialized.current = true;
    for (const order of orders) {
      const id = String(order.id);
      const status = String(order.status || '').toLowerCase();
      const previous = seen.current.get(id);
      seen.current.set(id, status);
      if (previous === undefined && !initialSnapshot) {
        const createdAt = Date.parse(order.created_at);
        if (Number.isFinite(createdAt) && createdAt >= Number(authenticatedAt || 0)
          && ['pending', 'completed'].includes(status)) {
          found.push({ id, status, order });
        }
      } else if (previous === 'pending' && status === 'completed') {
        found.push({ id, status, order });
      }
    }
    if (initialSnapshot) {
      const latestOrder = [...orders].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
      if (latestOrder && ['pending', 'completed'].includes(String(latestOrder.status || '').toLowerCase())) {
        found.push({ id: String(latestOrder.id), status: String(latestOrder.status).toLowerCase(), order: latestOrder });
      }
    }
    const unseen = found.filter((alert) => {
      const key = `${alert.id}:${alert.status}`;
      if (notified.current.keys.has(key)) return false;
      notified.current.keys.add(key);
      return true;
    });
    if (unseen.length) {
      saveNotified(userId, notified.current.keys);
      setAlerts((current) => [...current, ...unseen]);
    }
  }, [authenticatedAt, query.data, query.dataUpdatedAt, query.isFetchedAfterMount, userId]);

  const active = alerts[0];
  if (profile.data?.role === 'PLATFORM_ADMIN' || isHotelAdmin) return null;
  const retryProfile = profile.isError;
  const failed = retryProfile || query.isError;
  const hotelName = active?.order.hotel?.name || active?.order.hotel_name || 'the hotel';
  const isCompleted = active?.status === 'completed';
  const retryUpdates = () => retryProfile ? profile.refetch() : query.refetch();
  return <>
    {failed && <div className="toast customer-order-notification-error" role="alert">
      <span>{retryProfile ? 'Order status updates could not be started.' : 'Order status updates are temporarily unavailable.'}</span>
      <button type="button" className="text-button" onClick={retryUpdates}>Retry</button>
    </div>}
    {userId && active && <Dialog title={isCompleted ? 'Order completed' : 'Order pending'} onClose={closeFirst} className="customer-order-notification">
      <p>Your order <strong>#{active.id}</strong> from <strong>{hotelName}</strong> is {isCompleted ? 'completed' : 'pending'}.</p>
      <p>Placed {formatDate(active.order.created_at)}.</p>
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={closeFirst}>Dismiss</button>
        <Link className="button button-primary" to={`/orders/${active.id}`} onClick={closeFirst}>View order</Link>
      </div>
    </Dialog>}
  </>;
}
