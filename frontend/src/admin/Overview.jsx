import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDate, formatMoney } from '../lib/format.js';
import { AdminEmpty, AdminError, AdminLoading, PageHeading } from './components.jsx';
import { adminApi, adminKeys, displayError } from './api.js';
import { shiftDate, todayIST } from './date.js';

const pendingParams = { status: 'pending', page: 1, limit: 5 };
const rowsOf = (value) => value?.items || value?.data || (Array.isArray(value) ? value : []);
const retry = (count, error) => error.status >= 400 && error.status < 500 ? false : count < 1;

export default function AdminOverview() {
  const { hotelId, hotel } = useOutletContext();
  const [date] = React.useState(todayIST);
  const from = shiftDate(date, -6);
  const daily = useQuery({
    queryKey: adminKeys.daily(hotelId, date),
    queryFn: () => adminApi.dailySales(hotelId, date),
    staleTime: 30000,
    retry,
  });
  const top = useQuery({
    queryKey: adminKeys.top(hotelId, { from, to: date, limit: 5 }),
    queryFn: () => adminApi.topItems(hotelId, { from, to: date, limit: 5 }),
    staleTime: 30000,
    retry,
  });
  const pending = useQuery({
    queryKey: adminKeys.orders(hotelId, pendingParams),
    queryFn: () => adminApi.orders(hotelId, pendingParams),
    staleTime: 15000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    retry,
  });
  const topItems = rowsOf(top.data);
  const pendingOrders = rowsOf(pending.data);

  return <section className="admin-page">
    <PageHeading eyebrow="HOTEL WORKSPACE" title="Overview" actions={<Link className="button button-secondary" to={`/hotel/${hotelId}`}>View customer store</Link>}/>
    <p className="admin-overview-intro">{hotel.name} · Sales and pending orders are shown for this hotel only.</p>
    <div className="admin-summary-grid">
      <SummaryCard label="Completed orders today" query={daily} value={Number(daily.data?.completed_order_count || 0).toLocaleString('en-IN')}/>
      <SummaryCard label="Sales today" query={daily} value={formatMoney(daily.data?.total_sales || 0)}/>
      <SummaryCard label="Pending orders" query={pending} value={Number(pending.data?.meta?.total ?? pendingOrders.length).toLocaleString('en-IN')}/>
    </div>
    <div className="admin-overview-grid">
      <section className="admin-form-section admin-overview-panel">
        <div className="admin-section-heading"><div><h2>Top-selling items</h2><p>Completed orders over the last 7 days, including today.</p></div><Link to={`/admin/${hotelId}/reports`}>View reports</Link></div>
        {top.isPending ? <AdminLoading rows={3}/> : top.isError ? <AdminError error={{ ...top.error, message: displayError(top.error) }} retry={top.refetch}/> : !topItems.length ? <AdminEmpty title="No completed sales this week" detail="Top-selling dishes will appear after orders are completed."/> : <ol className="admin-overview-top-items">{topItems.map((item, index) => <li key={`${item.menu_item_id}-${item.item_name}`}><span className="admin-overview-rank">{index + 1}</span><strong>{item.item_name}</strong><span>{Number(item.quantity_sold).toLocaleString('en-IN')} sold</span></li>)}</ol>}
      </section>
      <section className="admin-form-section admin-overview-panel">
        <div className="admin-section-heading"><div><h2>Pending orders</h2><p>Orders awaiting completion or cancellation.</p></div><Link to={`/admin/${hotelId}/orders`}>Manage orders</Link></div>
        {pending.isPending ? <AdminLoading rows={3}/> : pending.isError ? <AdminError error={{ ...pending.error, message: displayError(pending.error) }} retry={pending.refetch}/> : !pendingOrders.length ? <AdminEmpty title="No pending orders" detail="New customer orders will appear here."/> : <div className="admin-overview-orders">{pendingOrders.map((order) => <article className="admin-overview-order" key={order.id}><div><strong>Order #{order.id}</strong><span>{order.customer_name || 'Customer'} · {formatDate(order.created_at)}</span></div><strong>{formatMoney(order.total_amount)}</strong><p>{order.items_summary || `${Number(order.item_count || 0).toLocaleString('en-IN')} items`}</p></article>)}</div>}
      </section>
    </div>
    <section className="admin-form-section admin-overview-panel">
      <div className="admin-section-heading"><div><h2>Quick links</h2><p>Common hotel management tasks.</p></div></div>
      <div className="admin-overview-links">
        <Link to={`/admin/${hotelId}/orders`}><strong>Orders</strong><span>Review and update customer orders</span></Link>
        <Link to={`/admin/${hotelId}/menu`}><strong>Menu</strong><span>Manage dishes, prices, and availability</span></Link>
        <Link to={`/admin/${hotelId}/reports`}><strong>Reports</strong><span>Explore sales and popular items</span></Link>
        <Link to={`/admin/${hotelId}/settings`}><strong>Hotel settings</strong><span>Update profile and order availability</span></Link>
      </div>
    </section>
  </section>;
}

function SummaryCard({ label, query, value }) {
  return <article className="admin-summary-card" aria-live="polite">
    <span>{label}</span>
    {query.isPending ? <div className="admin-overview-stat-loading"><AdminLoading rows={1}/></div> : query.isError ? <><strong>—</strong><small className="admin-overview-stat-error" role="alert">{displayError(query.error)}</small><button type="button" className="text-button" onClick={() => query.refetch()}>Retry</button></> : <strong>{value}</strong>}
  </article>;
}
