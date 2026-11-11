import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useSession } from '../store/session.js';
import HotelOrderNotifications from './HotelOrderNotifications.jsx';

const response = (data, meta) => Promise.resolve({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data, ...(meta ? { meta } : {}) }),
});

function renderNotifications() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><HotelOrderNotifications memberships={[{ hotel_id: 4, name: 'Cafe Harbor' }]}/></MemoryRouter></QueryClientProvider>);
}

describe('hotel admin order notifications', () => {
  beforeEach(() => {
    useSession.getState().clearSession();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows the pending order count and links to the tenant orders page', async () => {
    const now = Date.now();
    useSession.getState().setSession('hotel-token', { id: 8 });
    useSession.setState({ authenticatedAt: now - 60_000 });
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/me/hotels')) return response([{ hotel_id: 4, name: 'Cafe Harbor', status: 'active' }]);
      if (String(url).includes('/hotels/4/orders?')) return response([{
        id: 22,
        customer_name: 'Sam',
        created_at: new Date(now - 30_000).toISOString(),
        total_amount: '250.00',
      }, {
        id: 23,
        customer_name: 'Alex',
        created_at: new Date(now - 20_000).toISOString(),
        total_amount: '125.00',
      }], { total: 2, totalPages: 1 });
      throw new Error(`Unexpected request: ${url}`);
    });

    renderNotifications();

    expect(await screen.findByRole('dialog', { name: 'Pending orders' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Cafe Harbor has 2 pending orders');
    expect(screen.getByRole('link', { name: 'Review order' })).toHaveAttribute('href', '/admin/4/orders');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/hotels/4/orders?status=pending&page=1&limit=100',
      expect.any(Object),
    );
  });

  it('shows existing pending orders when the hotel admin logs in', async () => {
    const now = Date.now();
    useSession.getState().setSession('hotel-token', { id: 8 });
    useSession.setState({ authenticatedAt: now - 60_000 });
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/me/hotels')) return response([{ hotel_id: 4, name: 'Cafe Harbor', status: 'active' }]);
      if (String(url).includes('/hotels/4/orders?')) return response([{
        id: 21,
        customer_name: 'Sam',
        created_at: new Date(now - 120_000).toISOString(),
        total_amount: '250.00',
      }], { total: 1, totalPages: 1 });
      throw new Error(`Unexpected request: ${url}`);
    });

    renderNotifications();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/hotels/4/orders?status=pending&page=1&limit=100',
      expect.any(Object),
    ));
    expect(await screen.findByRole('dialog', { name: 'Pending orders' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Cafe Harbor has 1 pending order');
  });

  it('does not repeat a dismissed pending-order alert after the component is reopened', async () => {
    const now = Date.now();
    useSession.getState().setSession('hotel-token', { id: 8 });
    useSession.setState({ authenticatedAt: now - 60_000 });
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/me/hotels')) return response([{ hotel_id: 4, name: 'Cafe Harbor', status: 'active' }]);
      if (String(url).includes('/hotels/4/orders?')) return response([{
        id: 24,
        customer_name: 'Sam',
        created_at: new Date(now - 30_000).toISOString(),
        total_amount: '250.00',
      }], { total: 1, totalPages: 1 });
      throw new Error(`Unexpected request: ${url}`);
    });

    const first = renderNotifications();
    expect(await screen.findByRole('dialog', { name: 'Pending orders' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    first.unmount();

    renderNotifications();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/hotels/4/orders?status=pending&page=1&limit=100',
      expect.any(Object),
    ));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show a popup when no pending orders were received', async () => {
    useSession.getState().setSession('hotel-token', { id: 8 });
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/me/hotels')) return response([{ hotel_id: 4, name: 'Cafe Harbor', status: 'active' }]);
      if (String(url).includes('/hotels/4/orders?')) return response([], { total: 0, totalPages: 0 });
      throw new Error(`Unexpected request: ${url}`);
    });

    renderNotifications();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/hotels/4/orders?status=pending&page=1&limit=100',
      expect.any(Object),
    ));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
