import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../store/cart.js';
import { useSession } from '../store/session.js';
import { useHotel, usePlaceOrder } from '../api/hooks.js';
import { formatMoney, paiseToRupees, rupeesToPaise, sumPaise } from '../lib/format.js';
import { Button, ErrorState, Stepper } from '../components/ui/index.jsx';

const payments = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card']];
const upiIdPattern = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;

export default function Cart() {
  const cart = useCart();
  const token = useSession((state) => state.token);
  const navigate = useNavigate();
  const [payment, setPayment] = React.useState('cash');
  const [upiId, setUpiId] = React.useState('');
  const [cardLastFour, setCardLastFour] = React.useState('');
  const [lineErrors, setLineErrors] = React.useState({});
  const [message, setMessage] = React.useState('');
  const hotelQuery = useHotel(cart.hotelId);
  const mutation = usePlaceOrder();
  const total = sumPaise(cart.items);
  const hotel = hotelQuery.data;
  const closed = hotel && !hotel.accepting_orders;
  const paymentDetailsValid = payment === 'cash'
    || (payment === 'upi' && upiIdPattern.test(upiId.trim()))
    || (payment === 'card' && /^\d{4}$/.test(cardLastFour));

  const checkout = () => {
    if (!token) {
      navigate(`/login?next=${encodeURIComponent('/cart')}`);
      return;
    }
    if (closed || !cart.items.length || mutation.isPending || !paymentDetailsValid) return;

    setMessage('');
    setLineErrors({});
    mutation.mutate({
      hotelId: cart.hotelId,
      body: {
        payment_method: payment,
        items: cart.items.map((item) => ({
          menu_item_id: item.menu_item_id,
          quantity: item.qty,
        })),
      },
    }, {
      onSuccess: (data) => {
        const orderData = { order: data, hotelName: cart.hotelName, items: cart.items };
        sessionStorage.setItem('hotel-core-last-order', JSON.stringify(orderData));
        cart.clear();
        navigate('/order-placed', { state: orderData });
      },
      onError: (error) => {
        if (error.code === 'ITEM_UNAVAILABLE' || error.code === 'INVALID_MENU_ITEM') {
          const details = Array.isArray(error.details) ? error.details : [];
          const nextErrors = {};
          details.forEach((detail) => {
            const id = detail.menu_item_id || detail.id;
            if (id) nextErrors[id] = detail.message || error.message;
          });
          if (!Object.keys(nextErrors).length && cart.items[0]) {
            nextErrors[cart.items[0].menu_item_id] = error.message;
          }
          setLineErrors(nextErrors);
          return;
        }
        if (error.code === 'HOTEL_CLOSED' || error.code === 'HOTEL_SUSPENDED') {
          setMessage(error.message);
          hotelQuery.refetch();
          return;
        }
        setMessage(error.message);
      },
    });
  };

  if (!cart.items.length) {
    return <section className="page">
      <div className="state-panel">
        <span className="empty-icon">⌂</span>
        <h1>Your cart is empty</h1>
        <p>Find something delicious nearby.</p>
        <Link className="button button-primary" to="/">Browse hotels</Link>
      </div>
    </section>;
  }

  return <section className="page cart-page">
    <div className="page-header-actions">
      <Link className="button button-secondary" to="/search">Continue shopping</Link>
      <Link className="button button-primary" to="/orders">View my orders</Link>
    </div>
    <p className="eyebrow">YOUR ORDER</p>
    <h1>Your cart</h1>
    <h2>{cart.hotelName}</h2>
    {hotelQuery.isError && <ErrorState error={hotelQuery.error} retry={hotelQuery.refetch}/>}
    <div className="cart-lines">
      {cart.items.map((item) => <article
        className={`cart-line ${lineErrors[item.menu_item_id] ? 'line-error' : ''}`}
        key={item.menu_item_id}
      >
        <div>
          <h3>{item.name}</h3>
          <span>{formatMoney(item.price)} each</span>
          {lineErrors[item.menu_item_id] && <p className="line-error-copy">
            {lineErrors[item.menu_item_id]}{' '}
            <button type="button" onClick={() => {
              cart.remove(item.menu_item_id);
              setLineErrors((current) => {
                const next = { ...current };
                delete next[item.menu_item_id];
                return next;
              });
            }}>Remove</button>
          </p>}
        </div>
        <Stepper
          qty={item.qty}
          label={item.name}
          onIncrement={() => cart.increment(item.menu_item_id)}
          onDecrement={() => cart.decrement(item.menu_item_id)}
        />
        <strong>{formatMoney(paiseToRupees(rupeesToPaise(item.price) * item.qty))}</strong>
      </article>)}
    </div>

    <section className="payment-section" aria-labelledby="payment-heading">
      <h2 id="payment-heading">Payment method</h2>
      <p>Payment is recorded only. No online payment is taken.</p>
      <div className="payment-options">
        {payments.map(([value, label]) => <label key={value} className={payment === value ? 'selected' : ''}>
          <input
            type="radio"
            name="payment"
            value={value}
            checked={payment === value}
            onChange={() => setPayment(value)}
          />
          {label}
        </label>)}
      </div>
      {payment === 'upi' && <label className="field-label" htmlFor="checkout-upi-id">
        UPI ID
        <input
          id="checkout-upi-id"
          autoComplete="off"
          inputMode="email"
          value={upiId}
          onChange={(event) => setUpiId(event.target.value)}
          placeholder="name@bank"
          aria-invalid={Boolean(upiId) && !upiIdPattern.test(upiId.trim())}
        />
      </label>}
      {payment === 'card' && <label className="field-label" htmlFor="checkout-card-last-four">
        Last 4 digits of card
        <input
          id="checkout-card-last-four"
          autoComplete="off"
          inputMode="numeric"
          maxLength={4}
          pattern="[0-9]{4}"
          value={cardLastFour}
          onChange={(event) => setCardLastFour(event.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="1234"
          aria-invalid={Boolean(cardLastFour) && !/^\d{4}$/.test(cardLastFour)}
        />
      </label>}
      {payment !== 'cash' && <p className="payment-disclaimer">
        These details only validate the form. They are not sent to the server or used to process a payment.
      </p>}
    </section>

    {(closed || message) && <div className="closed-banner" role="alert">
      {message || 'This hotel is closed and cannot accept your order right now.'}
    </div>}
    <div className="bill-summary">
      <h2>Review your order</h2>
      <div>
        <span>Items ({cart.items.reduce((count, item) => count + item.qty, 0)})</span>
        <strong>{formatMoney(paiseToRupees(total))}</strong>
      </div>
      <div>
        <span>Payment method</span>
        <strong>{payments.find(([value]) => value === payment)?.[1] || 'Cash'}</strong>
      </div>
      <div>
        <span>Total due at checkout</span>
        <strong>{formatMoney(paiseToRupees(total))}</strong>
      </div>
      <p>No taxes or delivery fees in this version.</p>
    </div>
    {message && <p className="form-error" role="alert">{message}</p>}
    <div className="place-order-wrap">
      <Button
        className="full place-order"
        onClick={checkout}
        disabled={mutation.isPending || closed || hotelQuery.isPending || !paymentDetailsValid}
      >
        {mutation.isPending ? 'Placing order…' : `Place order · ${formatMoney(paiseToRupees(total))}`}
      </Button>
    </div>
  </section>;
}
