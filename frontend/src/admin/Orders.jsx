import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Clock3, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDate, formatMoney } from '../lib/format.js';
import { Button, StatusChip } from '../components/ui/index.jsx';
import { AdminEmpty, AdminError, AdminLoading, ConfirmDialog, PageHeading, Tabs, useNotice } from './components.jsx';
import { adminApi, adminKeys, displayError } from './api.js';

const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const statusTabs = [{ value: 'pending', label: 'Pending' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }];
const unwrapRows = (payload) => payload?.items || payload?.data || (Array.isArray(payload) ? payload : []);

export default function AdminOrders() {
  const { hotelId, suspended } = useOutletContext();
  const queryClient = useQueryClient();
  const notify = useNotice();
  const [status, setStatus] = React.useState('pending');
  const [date, setDate] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [loadedRows, setLoadedRows] = React.useState([]);
  const [expanded, setExpanded] = React.useState(null);
  const [cancelId, setCancelId] = React.useState(null);
  const [newIds, setNewIds] = React.useState([]);
  const seen = React.useRef(null);
  const queryParams = { status, page, limit: 20, ...((status === 'pending') ? (date ? { date } : {}) : { date: date || todayIST() }) };
  const query = useQuery({
    queryKey: adminKeys.orders(hotelId, queryParams),
    queryFn: () => adminApi.orders(hotelId, queryParams),
    staleTime: status === 'pending' ? 0 : 15000,
    refetchInterval: status === 'pending' ? 15000 : false,
    refetchIntervalInBackground: false,
    retry: (count, error) => error.status >= 400 && error.status < 500 ? false : count < 1,
  });
  const rows = unwrapRows(query.data);
  React.useEffect(() => { if (!query.data) return; setLoadedRows((old) => page === 1 ? rows : [...old, ...rows]); }, [query.dataUpdatedAt, page]);
  const totalPages = query.data?.meta?.totalPages || 1;
  React.useEffect(() => {
    if (!query.data) return;
    const ids = new Set(rows.map((order) => String(order.id)));
    if (seen.current && status === 'pending') setNewIds([...ids].filter((id) => !seen.current.has(id)));
    seen.current = ids;
    if (status === 'pending') document.title = `(${query.data?.meta?.total ?? rows.length}) Orders · hotel-core`;
    else document.title = `${status[0].toUpperCase()}${status.slice(1)} orders · hotel-core`;
  }, [query.dataUpdatedAt, status]);
  const refresh = () => query.refetch().then(() => setNewIds([]));

  const complete = useMutation({
    mutationFn: (id) => adminApi.updateOrder(hotelId, id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'orders', String(hotelId)] }); notify('Order marked completed.'); },
    onError: async (error) => { if (error.status === 409) { await queryClient.invalidateQueries({ queryKey: ['admin', 'orders', String(hotelId)] }); notify('This order changed. The latest status has been refreshed.', 'error'); } else notify(displayError(error), 'error'); },
  });
  const cancel = useMutation({
    mutationFn: (id) => adminApi.cancelOrder(hotelId, id),
    onSuccess: () => { setCancelId(null); queryClient.invalidateQueries({ queryKey: ['admin', 'orders', String(hotelId)] }); notify('Order cancelled.'); },
    onError: async (error) => { setCancelId(null); if (error.status === 409) { await queryClient.invalidateQueries({ queryKey: ['admin', 'orders', String(hotelId)] }); notify('This order changed. The latest status has been refreshed.', 'error'); } else notify(displayError(error), 'error'); },
  });

  const changeStatus = (value) => { setStatus(value); setPage(1); setExpanded(null); setNewIds([]); setLoadedRows([]); if (value === 'pending') setDate(''); else setDate(todayIST()); };
  const suspendedError = (error) => ['HOTEL_SUSPENDED', 'HOTEL_NOT_FOUND'].includes(error?.code) || suspended;
  if (query.isPending) return <section className="admin-page"><AdminLoading rows={4}/></section>;
  if (query.isError && !rows.length) return <section className="admin-page"><PageHeading eyebrow="HOTEL WORKSPACE" title="Live orders"/><AdminError error={{ ...query.error, message: suspendedError(query.error) ? 'This hotel is unavailable or suspended. Ask a platform administrator to review it.' : displayError(query.error) }} retry={query.refetch}/></section>;
  return <section className="admin-page">
    <PageHeading eyebrow="HOTEL WORKSPACE" title="Live orders" actions={<><span className="admin-last-updated">Updated {query.dataUpdatedAt ? formatDate(query.dataUpdatedAt) : '—'}</span><Button variant="secondary" onClick={refresh} disabled={query.isFetching}><RefreshCw size={16}/> Refresh</Button></>}/>
    <Tabs items={statusTabs} value={status} onChange={changeStatus} label="Order status"/>
    <div className="admin-toolbar">{status === 'pending' ? <label className="admin-toggle admin-date-toggle"><span className="admin-toggle-copy"><strong>Show all pending dates</strong><small>Pending orders are live by default.</small></span><input type="checkbox" checked={!date} onChange={(event) => { setDate(event.target.checked ? '' : todayIST()); setPage(1); }}/><span className="admin-toggle-track" aria-hidden="true"/></label> : <label>Order date <input type="date" value={date || todayIST()} onChange={(event) => { setDate(event.target.value); setPage(1); }}/></label>}{query.isFetching && <span className="admin-last-updated" role="status">Refreshing…</span>}</div>
    {query.isError && <div className="admin-inline-error" role="alert">{displayError(query.error)}</div>}
    {!loadedRows.length ? <AdminEmpty title={`No ${status} orders`} detail={status === 'pending' ? 'New customer orders will appear here automatically.' : 'Try another date to see order history.'}/> : <div className="admin-order-list">{loadedRows.map((order) => <OrderCard key={order.id} order={order} hotelId={hotelId} expanded={expanded === String(order.id)} onExpand={() => setExpanded(expanded === String(order.id) ? null : String(order.id))} isNew={newIds.includes(String(order.id))} onComplete={() => complete.mutate(order.id)} onCancel={() => setCancelId(order.id)} completing={complete.isPending && String(complete.variables) === String(order.id)} cancelling={cancel.isPending && String(cancel.variables) === String(order.id)} canWrite={!suspended}/>)}</div>}
    {page < totalPages && <button type="button" className="button button-secondary load-more" disabled={query.isFetching} onClick={() => setPage((value) => value + 1)}>Load more</button>}
    {cancelId && <ConfirmDialog title="Cancel this order?" danger confirmLabel="Cancel order" pending={cancel.isPending} onClose={() => setCancelId(null)} onConfirm={() => cancel.mutate(cancelId)}><p>This pending order will be marked cancelled. The customer will see its updated status.</p></ConfirmDialog>}
  </section>;
}

function OrderCard({ order, hotelId, expanded, onExpand, isNew, onComplete, onCancel, completing, cancelling, canWrite }) {
  const detail = useQuery({ queryKey: adminKeys.order(hotelId, order.id), queryFn: () => adminApi.order(hotelId, order.id), enabled: expanded, staleTime: 30000, retry: (count, error) => error.status >= 400 && error.status < 500 ? false : count < 1 });
  const cancelled = order.cancelled_at || order.status === 'cancelled';
  const currentStatus = cancelled ? 'cancelled' : order.status;
  return <article className={`admin-order-card ${isNew ? 'is-new' : ''}`}>
    <div className="admin-order-head"><h2>Order #{order.id}</h2><StatusChip status={currentStatus}/></div>
    <div className="admin-order-meta"><span><Clock3 size={14}/>{formatDate(order.created_at)}</span><span>{order.customer_name}</span>{order.phone && <a href={`tel:${order.phone}`}>{order.phone}</a>}</div>
    <div className="admin-order-meta"><span>Payment: {String(order.payment_method || '').toUpperCase()}</span><span>{order.items_summary || `${order.item_count || 'Items'} in order`}</span></div>
    <div className="admin-order-total"><span>Total</span><strong>{formatMoney(order.total_amount)}</strong></div>
    <div className="admin-order-actions"><Button variant="secondary" aria-expanded={expanded} onClick={onExpand}>{expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>} {expanded ? 'Hide items' : 'View items'}</Button>{currentStatus === 'pending' && <><Button disabled={!canWrite || completing || cancelling} onClick={onComplete}>{completing ? 'Saving…' : 'Mark completed'}</Button><Button variant="danger" disabled={!canWrite || completing || cancelling} onClick={onCancel}>{cancelling ? 'Saving…' : 'Cancel'}</Button></>}</div>
    {expanded && <div className="admin-order-details" aria-live="polite">{detail.isPending ? <span>Loading order items…</span> : detail.isError ? <div className="admin-inline-error" role="alert">{displayError(detail.error)} <button type="button" className="text-button" onClick={() => detail.refetch()}>Retry</button></div> : <><h3>Items</h3><ul>{(detail.data?.items || []).map((item) => <li key={item.menu_item_id}>{item.quantity} × {item.item_name} — {formatMoney(item.subtotal)}</li>)}</ul></>}</div>}
  </article>;
}
