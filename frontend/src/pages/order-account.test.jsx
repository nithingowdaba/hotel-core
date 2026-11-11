import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Account from './Account.jsx';
import Orders from './Orders.jsx';
import { formatDate } from '../lib/format.js';
import { useSession } from '../store/session.js';

const response = (data, meta) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data, ...(meta ? { meta } : {}) }),
});

function renderPage(page) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>{page}</MemoryRouter></QueryClientProvider>);
}

describe('customer order history and account', () => {
  beforeEach(() => {
    useSession.getState().setSession('test-token', { id: 7 });
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    useSession.getState().clearSession();
    vi.unstubAllGlobals();
  });

  it('sends the selected order filter, resets pagination, and keeps unfiltered history', async () => {
    global.fetch.mockImplementation(async (url) => {
      const parsed = new URL(String(url), 'http://hotel.test');
      if (parsed.pathname !== '/api/me/orders') throw new Error(`Unexpected request: ${url}`);
      const page = parsed.searchParams.get('page');
      const status = parsed.searchParams.get('status');
      if (!status && page === '1') return response([{ id: 1, status: 'pending', created_at: new Date(Date.now() - 86400000).toISOString(), total_amount: '25.00', hotel: { name: 'Cafe' } }], { total: 2, totalPages: 2, page: 1 });
      if (!status && page === '2') return response([{ id: 2, status: 'completed', created_at: new Date(Date.now() - 10 * 86400000).toISOString(), total_amount: '25.00', hotel: { name: 'Cafe' } }], { total: 2, totalPages: 2, page: 2 });
      if (status === 'pending') return response([{ id: 3, status: 'pending', created_at: '2026-11-05T10:00:00Z', total_amount: '25.00', hotel: { name: 'Cafe' } }], { total: 1, totalPages: 1, page: 1 });
      if (status === 'past') return response([{ id: 4, status: 'cancelled', created_at: '2026-11-04T10:00:00Z', total_amount: '25.00', hotel: { name: 'Cafe' } }], { total: 1, totalPages: 1, page: 1 });
      throw new Error(`Unexpected order query: ${parsed.search}`);
    });

    renderPage(<Orders/>);
    expect(await screen.findByText('Order #1')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recent orders' })).toContainElement(screen.getByText('Order #1'));
    expect(screen.getByRole('link', { name: /Cafe.*Order #1/ })).toHaveClass('order-card-pending');
    expect(global.fetch.mock.calls[0][0]).toContain('/api/me/orders?page=1&limit=20');
    expect(global.fetch.mock.calls[0][0]).not.toContain('status=');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Order #2')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Earlier orders' })).toContainElement(screen.getByText('Order #2'));

    fireEvent.click(screen.getByRole('tab', { name: 'Active' }));
    expect(await screen.findByText('Order #3')).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/me/orders?page=1&limit=20&status=pending', expect.any(Object),
    ));
    expect(screen.queryByText('Order #2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Past' }));
    expect(await screen.findByText('Order #4')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/me/orders?page=1&limit=20&status=past', expect.any(Object));
  });

  it('renders membership names from the /auth/me contract', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/me/hotels')) return response([{ hotel_id: 12, name: 'Harbor Hotel', slug: 'harbor-hotel', status: 'pending' }]);
      if (String(url).includes('/me/orders')) return response([]);
      return response({
        id: 7, full_name: 'Asha', email: 'asha@example.test', phone: '9000000000', role: 'HOTEL_ADMIN',
        admin_of: [{ hotel_id: 12, name: 'Harbor Hotel', slug: 'harbor-hotel' }],
      });
    });
    renderPage(<Account/>);
    expect(await screen.findByRole('link', { name: /Manage Harbor Hotel/ })).toHaveAttribute('href', '/admin/12');
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
    expect(await screen.findByRole('heading', { name: 'Your Orders' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Partner with us/ })).toHaveAttribute('href', '/partner');
    expect(screen.queryByText('Manage undefined')).not.toBeInTheDocument();
  });

  it('shows a home button on the standalone orders page', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/me/orders')) return response([]);
      throw new Error(`Unexpected request: ${url}`);
    });

    renderPage(<Orders/>);
    expect(await screen.findByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
  });

  it('shows no hotel tools for users without memberships', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (String(url).includes('/me/hotels')) return response([]);
      if (String(url).includes('/me/orders')) return response([]);
      return response({ id: 8, full_name: 'Customer', email: 'customer@example.test', phone: '9000000001', role: 'CUSTOMER', admin_of: [] });
    });
    renderPage(<Account/>);
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
    expect(screen.getByText('You do not manage any hotels yet.')).toBeInTheDocument();
  });

  it('shows order history inside the account page', async () => {
    global.fetch.mockImplementation(async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes('/me/orders')) return response([{
        id: 18,
        status: 'pending',
        created_at: '2026-11-05T10:00:00Z',
        payment_method: 'upi',
        total_amount: '25.00',
        hotel: { name: 'Cafe' },
      }]);
      if (requestUrl.includes('/me/hotels')) return response([]);
      return response({ id: 8, full_name: 'Customer', email: 'customer@example.test', role: 'CUSTOMER', admin_of: [] });
    });

    renderPage(<Account/>);

    expect(await screen.findByRole('heading', { name: 'Your Orders' })).toBeInTheDocument();
    const orderLink = await screen.findByRole('link', { name: /Cafe.*Order #18/ });
    expect(orderLink).toHaveAttribute('href', '/orders/18');
    expect(orderLink).toHaveTextContent('Payment: UPI');
    expect(orderLink).toHaveTextContent(formatDate('2026-11-05T10:00:00Z'));
  });
});
