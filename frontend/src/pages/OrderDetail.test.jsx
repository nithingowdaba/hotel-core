import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSession } from '../store/session.js';
import { formatDate } from '../lib/format.js';
import OrderDetail from './OrderDetail.jsx';

const response = (data) => Promise.resolve({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data }),
});
let orderFixture;

function renderOrderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/orders/45']}>
      <Routes><Route path="/orders/:id" element={<OrderDetail/>}/></Routes>
    </MemoryRouter>
  </QueryClientProvider>);
}

describe('customer order status timeline', () => {
  beforeEach(() => {
    orderFixture = { status: 'pending', cancelled_at: null };
    useSession.getState().setSession('customer-token', { id: 7 });
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).includes('/me/orders/45')) {
        return response({
          id: 45,
          hotel_id: 4,
          hotel_name: 'Cafe Harbor',
          created_at: '2026-11-06T08:00:00.000Z',
          payment_method: 'cash',
          total_amount: '25.00',
          items: [{ menu_item_id: 3, item_name: 'Dosa', quantity: 1, subtotal: '25.00' }],
          ...orderFixture,
        });
      }
      if (String(url).includes('/hotels/4/menu')) return response({ categories: [] });
      throw new Error(`Unexpected request: ${url}`);
    }));
  });
  afterEach(() => {
    useSession.getState().clearSession();
    vi.unstubAllGlobals();
  });

  it('shows the awaiting-hotel step for pending orders', async () => {
    renderOrderDetail();

    expect(await screen.findByRole('region', { name: 'Order progress' })).toBeInTheDocument();
    expect(screen.getByText('Order placed')).toBeInTheDocument();
    expect(screen.getByText('Awaiting hotel')).toBeInTheDocument();
    expect(screen.getByText('The hotel has not completed this order yet.')).toBeInTheDocument();
    expect(screen.getByText('Payment: CASH')).toBeInTheDocument();
    expect(screen.getAllByText(formatDate('2026-11-06T08:00:00.000Z')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument();
  });

  it('shows the completed terminal step without inventing a completion time', async () => {
    orderFixture = { status: 'completed', cancelled_at: null };
    renderOrderDetail();

    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('The hotel marked this order completed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  });

  it('shows cancellation time when available', async () => {
    orderFixture = { status: 'cancelled', cancelled_at: '2026-11-06T09:00:00.000Z' };
    renderOrderDetail();

    expect(await screen.findByText(/^Cancelled /)).toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Cancelled');
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  });
});
