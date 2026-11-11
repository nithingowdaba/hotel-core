import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCancelOrder, useMenu, useOrder } from '../api/hooks.js';
import { useCart } from '../store/cart.js';
import { formatDate, formatMoney } from '../lib/format.js';
import { Dialog, ErrorState, StatusChip } from '../components/ui/index.jsx';

export default function OrderDetail() {
  const { id } = useParams();
  const query = useOrder(id);
  const cancel = useCancelOrder();
  const order = query.data;
  const menuQuery = useMenu(order?.hotel_id);
  const cart = useCart();
  const navigate = useNavigate();
  const [confirm, setConfirm] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [reorder, setReorder] = React.useState(null);

  if (query.isPending) return <section className="page loading-lines"><div/><div/><div/></section>;
  if (query.isError) return <section className="page"><ErrorState error={query.error} retry={query.refetch}/></section>;

  const items = order.items || [];
  const status = order.status || (order.cancelled_at ? 'cancelled' : 'pending');
  const startReorder = () => {
    if (!menuQuery.isSuccess) {
      setNotice('The current menu is still loading. Try again in a moment.');
      return;
    }

    const menuItems = (menuQuery.data?.categories || []).flatMap((category) => category.items);
    const matched = [];
    const skipped = [];
    items.forEach((oldItem) => {
      const current = menuItems.find((item) => Number(item.id) === Number(oldItem.menu_item_id) && item.is_available);
      if (current) matched.push({ ...current, quantity: Number(oldItem.quantity) });
      else skipped.push(oldItem.item_name);
    });

    if (!matched.length) {
      setNotice(`No previous items are currently available${skipped.length ? `: ${skipped.join(', ')}` : ''}.`);
      return;
    }

    const info = {
      hotelId: Number(order.hotel_id),
      hotelName: order.hotel?.name || order.hotel_name,
      matched,
      skipped,
    };
    if (cart.hotelId && Number(cart.hotelId) !== Number(order.hotel_id)) setReorder(info);
    else apply(info);
  };
  const apply = (info) => {
    if (cart.hotelId && Number(cart.hotelId) !== Number(info.hotelId)) {
      cart.replaceWithHotel({ id: info.hotelId, name: info.hotelName });
    }
    info.matched.forEach((item) => {
      cart.add({ id: info.hotelId, name: info.hotelName }, item);
      for (let index = 1; index < item.quantity && index < 999; index += 1) cart.increment(item.id);
    });
    setNotice(info.skipped.length
      ? `Added available dishes. Skipped: ${info.skipped.join(', ')}.`
      : 'Available dishes added to your cart.');
    setReorder(null);
    navigate('/cart');
  };
  const cancelOrder = () => cancel.mutate(id, {
    onSuccess: () => {
      setConfirm(false);
      query.refetch();
    },
    onError: (error) => {
      setConfirm(false);
      if (error.code === 'CANCELLATION_NOT_ALLOWED') {
        setNotice('This order can no longer be cancelled. We refreshed its status.');
        query.refetch();
      } else setNotice(error.message);
    },
  });

  return <section className="page order-detail">
    <Link to="/orders" className="back-link">← Your orders</Link>
    <p className="eyebrow">ORDER #{order.id}</p>
    <div className="order-detail-head">
      <h1>{order.hotel?.name || order.hotel_name}</h1>
      <StatusChip status={status}/>
    </div>
    <p>{formatDate(order.created_at)}</p>
    <OrderTimeline order={order} status={status}/>
    <section className="detail-card">
      <h2>Items</h2>
      {items.map((item) => <div className="bill-row" key={item.menu_item_id}>
        <span>{item.quantity} × {item.item_name}</span>
        <strong>{formatMoney(item.subtotal)}</strong>
      </div>)}
      <div className="bill-row total"><span>Total</span><strong>{formatMoney(order.total_amount)}</strong></div>
      <p>Payment: {String(order.payment_method || 'unknown').toUpperCase()}</p>
    </section>
    {notice && <p role="status" className="inline-notice">{notice}</p>}
    <div className="detail-actions">
      {status === 'pending' && <button className="button button-danger" onClick={() => setConfirm(true)}>Cancel order</button>}
      <button className="button button-primary" disabled={menuQuery.isFetching} onClick={startReorder}>
        {menuQuery.isFetching ? 'Loading menu…' : 'Reorder'}
      </button>
    </div>
    {confirm && <Dialog title="Cancel this order?" onClose={() => setConfirm(false)}>
      <p>Pending orders can be cancelled. This action cannot be undone.</p>
      <div className="dialog-actions">
        <button className="button button-secondary" onClick={() => setConfirm(false)}>Keep order</button>
        <button className="button button-danger" disabled={cancel.isPending} onClick={cancelOrder}>Confirm cancel</button>
      </div>
    </Dialog>}
    {reorder && <Dialog title="Replace cart?" onClose={() => setReorder(null)}>
      <p>Your cart has items from <strong>{cart.hotelName}</strong>. Reorder from {reorder.hotelName} instead?</p>
      {reorder.skipped.length > 0 && <p>Unavailable and skipped: {reorder.skipped.join(', ')}</p>}
      <div className="dialog-actions">
        <button className="button button-secondary" onClick={() => setReorder(null)}>Keep current cart</button>
        <button className="button button-primary" onClick={() => apply(reorder)}>Replace and continue</button>
      </div>
    </Dialog>}
  </section>;
}

function OrderTimeline({ order, status }) {
  const placedAt = formatDate(order.created_at);
  const terminalStatus = status === 'cancelled' ? 'cancelled' : status === 'completed' ? 'completed' : 'pending';
  return <section className="order-progress" aria-label="Order progress">
    <h2>Order status</h2>
    <ol className="order-timeline">
      <li className="order-timeline-step is-complete">
        <span className="order-timeline-marker" aria-hidden="true"/>
        <div><strong>Order placed</strong><time dateTime={order.created_at}>{placedAt}</time></div>
      </li>
      <li className={`order-timeline-step is-${terminalStatus}`} aria-current="step">
        <span className="order-timeline-marker" aria-hidden="true"/>
        <div>
          <strong>{terminalStatus === 'cancelled' ? 'Cancelled' : terminalStatus === 'completed' ? 'Completed' : 'Awaiting hotel'}</strong>
          <span>
            {terminalStatus === 'cancelled'
              ? order.cancelled_at ? `Cancelled ${formatDate(order.cancelled_at)}` : 'This order was cancelled.'
              : terminalStatus === 'completed'
                ? 'The hotel marked this order completed.'
                : 'The hotel has not completed this order yet.'}
          </span>
        </div>
      </li>
    </ol>
  </section>;
}
