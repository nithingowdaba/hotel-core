import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Account from './Account.jsx';
import Orders from './Orders.jsx';
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
      if (!status && page === '1') return response([{ id: 1, status: 'pending', created_at: '2026-11-05T10:00:00Z', total_amount: '25.00', hotel: { name: 'Cafe' } }], { total: 2, totalPages: 2, page: 1 });
      if (!status && page === '2') return response([{ id: 2, status: 'completed', created_at: '2026-11-04T10:00:00Z', total_amount: '25.00', hotel: { name: 'Cafe' } }], { total: 2, totalPages: 2, page: 2 });
      if (status === 'pending') return response([{ id: 3, status: 'pending', created_at: '2026-11-05T10:00:00Z', total_amount: '25.00', hotel: { name: 'Cafe' } }], { total: 1, totalPages: 1, page: 1 });
      if (status === 'past') return response([{ id: 4, status: 'cancelled', created_at: '2026-11-04T10:00:00Z', total_amount: '25.00', hotel: { name: 'Cafe' } }], { total: 1, totalPages: 1, page: 1 });
      throw new Error(`Unexpected order query: ${parsed.search}`);
    });

    renderPage(<Orders/>);
    expect(await screen.findByText('Order #1')).toBeInTheDocument();
    expect(global.fetch.mock.calls[0][0]).toContain('/api/me/orders?page=1&limit=20');
    expect(global.fetch.mock.calls[0][0]).not.toContain('status=');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Order #2')).toBeInTheDocument();

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
    global.fetch.mockImplementation(async (url) => String(url).includes('/me/hotels')
      ? response([{ hotel_id: 12, name: 'Harbor Hotel', slug: 'harbor-hotel', status: 'pending' }])
      : response({
        id: 7, full_name: 'Asha', email: 'asha@example.test', phone: '9000000000', role: 'HOTEL_ADMIN',
        admin_of: [{ hotel_id: 12, name: 'Harbor Hotel', slug: 'harbor-hotel' }],
      }));
    renderPage(<Account/>);
    expect(await screen.findByRole('link', { name: /Manage Harbor Hotel/ })).toHaveAttribute('href', '/admin/12');
    expect(screen.queryByText('Manage undefined')).not.toBeInTheDocument();
  });

  it('shows no hotel tools for users without memberships', async () => {
    global.fetch.mockImplementation(async (url) => String(url).includes('/me/hotels')
      ? response([])
      : response({ id: 8, full_name: 'Customer', email: 'customer@example.test', phone: '9000000001', role: 'CUSTOMER', admin_of: [] }));
    renderPage(<Account/>);
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('You do not manage any hotels yet.')).toBeInTheDocument();
  });
});
