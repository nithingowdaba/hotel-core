import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { formatDate, formatMoney } from '../lib/format.js';

export default function OrderPlaced() {
  const { state } = useLocation();
  let saved = {};
  try {
    saved = JSON.parse(sessionStorage.getItem('hotel-core-last-order') || '{}');
  } catch {
    // Ignore invalid cached order details and render the confirmation without them.
  }
  const data = state || saved;
  const order = data.order || {};
  const id = order.id || order.order_id;
  const items = data.items || order.items || [];
  const total = order.total_amount || order.total || 0;

  return <section className="page success-page">
    <Link className="button button-secondary success-back-home" to="/"><ArrowLeft size={18}/>Back to home</Link>
    <div className="success-mark"><Check size={34}/></div>
    <p className="eyebrow">ORDER CONFIRMED</p>
    <h1>That’s a good choice.</h1>
    <p>Your order has been sent to {data.hotelName || 'the hotel'}.</p>
    <div className="success-card">
      <span>Order number</span>
      <strong>#{id || '—'}</strong>
      {items.map((item) => <p key={item.menu_item_id || item.id}>{item.qty || item.quantity} × {item.name || item.item_name}</p>)}
      <div className="success-total"><span>Total</span><strong>{formatMoney(total)}</strong></div>
      <p>Payment method: {String(order.payment_method || 'unknown').toUpperCase()}</p>
      {order.created_at && <p>Order time: <time dateTime={order.created_at}>{formatDate(order.created_at)}</time></p>}
    </div>
    <div className="success-actions">
      <Link className="button button-primary" to={id ? `/orders/${id}` : '/orders'}>View order</Link>
    </div>
  </section>;
}
