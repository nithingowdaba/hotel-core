import React from 'react';
import { Link } from 'react-router-dom';
import { useMyOrders } from '../api/hooks.js';
import { formatDate, formatMoney } from '../lib/format.js';
import { ErrorState, Skeleton, StatusChip } from '../components/ui/index.jsx';
export default function Orders() {
  const [filter, setFilter] = React.useState('all');
  const [page, setPage] = React.useState(1);
  const status = filter === 'active' ? 'pending' : filter === 'past' ? 'past' : undefined;
  const params = { page, limit: 20, ...(status ? { status } : {}) };
  const q = useMyOrders(params);
  const payload = q.data;
  const orders = payload?.items || payload?.data || (Array.isArray(payload) ? payload : []);
  const changeFilter = (value) => {
    setFilter(value);
    setPage(1);
  };

  return <section className="page">
    <p className="eyebrow">YOUR HISTORY</p><h1>Your orders</h1>
    <div className="tabs" role="tablist">
      {[
        ['all', 'All'], ['active', 'Active'], ['past', 'Past'],
      ].map(([value, label]) => <button type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => changeFilter(value)} key={value}>{label}</button>)}
    </div>
    {q.isPending ? <Skeleton count={4}/> : q.isError ? <ErrorState error={q.error} retry={q.refetch}/> : !orders.length ? <div className="state-panel"><strong>No {filter === 'all' ? 'orders' : `${filter} orders`} yet</strong><Link className="button button-primary" to="/">Explore hotels</Link></div> : <>
      <div className="order-list">{orders.map((order) => <Link className="order-card" to={`/orders/${order.id}`} key={order.id}>
        <div className="order-card-head"><div><h2>{order.hotel?.name || order.hotel_name}</h2><time>{formatDate(order.created_at)}</time></div><StatusChip status={order.status}/></div>
        <p>{order.items_summary || `${order.item_count || 0} items`}</p>
        <div className="order-card-foot"><span>Order #{order.id}</span><strong>{formatMoney(order.total_amount)}</strong></div>
      </Link>)}</div>
      {(payload?.meta?.totalPages || 1) > page && <button type="button" className="button button-secondary load-more" onClick={() => setPage((current) => current + 1)}>Load more</button>}
    </>}
  </section>;
}
