import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useMyOrders } from '../api/hooks.js';
import { formatDate, formatMoney } from '../lib/format.js';
import { ErrorState, Skeleton, StatusChip } from '../components/ui/index.jsx';
export default function Orders({ embedded = false }) {
  const [filter, setFilter] = React.useState('all');
  const [page, setPage] = React.useState(1);
  const status = filter === 'active' ? 'pending' : filter === 'past' ? 'past' : undefined;
  const params = { page, limit: 20, ...(status ? { status } : {}) };
  const q = useMyOrders(params);
  const payload = q.data;
  const orders = payload?.items || payload?.data || (Array.isArray(payload) ? payload : []);
  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentOrders = orders.filter((order) => {
    const createdAt = Date.parse(order.created_at);
    return Number.isFinite(createdAt) && createdAt >= recentCutoff;
  });
  const earlierOrders = orders.filter((order) => {
    const createdAt = Date.parse(order.created_at);
    return !Number.isFinite(createdAt) || createdAt < recentCutoff;
  });
  const changeFilter = (value) => {
    setFilter(value);
    setPage(1);
  };

  return <section className={embedded ? 'account-order-history' : 'page'}>
    {embedded
      ? <h2>Your Orders</h2>
      : <><Link className="button button-secondary orders-back-home" to="/"><ArrowLeft size={18}/>Back to home</Link><p className="eyebrow">YOUR HISTORY</p><h1>Your orders</h1></>}
    <div className="tabs" role="tablist">
      {[
        ['all', 'All'], ['active', 'Active'], ['past', 'Past'],
      ].map(([value, label]) => <button type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => changeFilter(value)} key={value}>{label}</button>)}
    </div>
    {q.isPending ? <Skeleton count={4}/> : q.isError ? <ErrorState error={q.error} retry={q.refetch}/> : !orders.length ? <div className="state-panel"><strong>No {filter === 'all' ? 'orders' : `${filter} orders`} yet</strong><Link className="button button-primary" to="/">Explore hotels</Link></div> : <>
      <div className="order-history-groups">
        {recentOrders.length > 0 && <OrderGroup title="Recent orders" orders={recentOrders}/>}
        {earlierOrders.length > 0 && <OrderGroup title="Earlier orders" orders={earlierOrders}/>}
      </div>
      {(payload?.meta?.totalPages || 1) > page && <button type="button" className="button button-secondary load-more" onClick={() => setPage((current) => current + 1)}>Load more</button>}
    </>}
  </section>;
}

function OrderGroup({ title, orders }) {
  return <section className="order-history-group" aria-label={title}>
    <h2>{title}</h2>
    <div className="order-list">{orders.map((order) => {
      const isPending = order.status === 'pending';
      return <Link className={`order-card ${isPending ? 'order-card-pending' : ''}`} to={`/orders/${order.id}`} key={order.id}>
        <div className="order-card-head"><div><h3>{order.hotel?.name || order.hotel_name}</h3><time dateTime={order.created_at}>{formatDate(order.created_at)}</time></div><StatusChip status={order.status}/></div>
        <p>{order.items_summary || `${order.item_count || 0} items`}</p>
        <p>Payment: {String(order.payment_method || 'unknown').toUpperCase()}</p>
        <div className="order-card-foot"><span>Order #{order.id}</span><strong>{formatMoney(order.total_amount)}</strong></div>
      </Link>;
    })}</div>
  </section>;
}
