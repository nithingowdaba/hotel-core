import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Cart from './Cart.jsx';
import { useCart } from '../store/cart.js';
import { useSession } from '../store/session.js';

describe('checkout review', () => {
  beforeEach(() => {
    useCart.getState().clear();
    useSession.getState().setSession('customer-token', { id: 7 });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 4, name: 'Cafe Harbor', accepting_orders: true } }),
    })));
    useCart.getState().add({ id: 4, name: 'Cafe Harbor' }, { id: 12, name: 'Dosa', price: 25 });
    useCart.getState().increment(12);
  });

  afterEach(() => {
    useCart.getState().clear();
    useSession.getState().clearSession();
    vi.unstubAllGlobals();
  });

  it('summarizes item quantity, chosen payment, and total before checkout', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/cart']}>
        <Routes><Route path="/cart" element={<Cart/>}/></Routes>
      </MemoryRouter>
    </QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: 'Review your order' })).toBeInTheDocument();
    expect(screen.getByText('Items (2)')).toBeInTheDocument();
    expect(screen.getAllByText('Payment method')[1].parentElement).toHaveTextContent('Cash');
    expect(screen.getByText('Total due at checkout').parentElement).toHaveTextContent('₹50.00');
    expect(screen.getByRole('button', { name: /Place order.*₹50/ })).toBeInTheDocument();
  });

  it('requires a valid UPI ID and does not send it to the API', async () => {
    global.fetch.mockImplementation((url) => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: String(url).includes('/orders')
          ? { id: 45, total_amount: '50.00', payment_method: 'upi', created_at: '2026-11-06T08:00:00Z' }
          : { id: 4, name: 'Cafe Harbor', accepting_orders: true },
      }),
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/cart']}>
        <Routes>
          <Route path="/cart" element={<Cart/>}/>
          <Route path="/order-placed" element={<p>Order confirmed</p>}/>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>);

    await screen.findByRole('heading', { name: 'Review your order' });
    fireEvent.click(screen.getByRole('radio', { name: 'UPI' }));
    const placeOrder = screen.getByRole('button', { name: /Place order/ });
    expect(screen.getByLabelText('UPI ID')).toBeInTheDocument();
    expect(placeOrder).toBeDisabled();

    fireEvent.change(screen.getByLabelText('UPI ID'), { target: { value: 'customer@bank' } });
    expect(placeOrder).toBeEnabled();
    fireEvent.click(placeOrder);

    await screen.findByText('Order confirmed');
    const orderRequest = global.fetch.mock.calls.find(([url]) => String(url).includes('/orders'));
    expect(orderRequest).toBeDefined();
    expect(JSON.parse(orderRequest[1].body)).toEqual({
      payment_method: 'upi',
      items: [{ menu_item_id: 12, quantity: 2 }],
    });
    expect(orderRequest[1].body).not.toContain('customer@bank');
  });

  it('accepts only four numeric card digits before enabling checkout', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/cart']}>
        <Routes><Route path="/cart" element={<Cart/>}/></Routes>
      </MemoryRouter>
    </QueryClientProvider>);

    await screen.findByRole('heading', { name: 'Review your order' });
    fireEvent.click(screen.getByRole('radio', { name: 'Card' }));
    const cardInput = screen.getByLabelText('Last 4 digits of card');
    const placeOrder = screen.getByRole('button', { name: /Place order/ });
    expect(placeOrder).toBeDisabled();
    fireEvent.change(cardInput, { target: { value: '12ab' } });
    expect(cardInput).toHaveValue('12');
    expect(placeOrder).toBeDisabled();
    fireEvent.change(cardInput, { target: { value: '1234' } });
    expect(placeOrder).toBeEnabled();
  });
});
