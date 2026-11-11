import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useSession } from '../store/session.js';
import CustomerOrderNotifications from './CustomerOrderNotifications.jsx';

const response = (data, meta) => Promise.resolve({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data, ...(meta ? { meta } : {}) }),
});

function renderNotifications() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter><CustomerOrderNotifications/></MemoryRouter></QueryClientProvider>) };
}

describe('customer order status notifications', () => {
  beforeEach(() => {
    useSession.getState().clearSession();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows the current order status for orders placed after login', async () => {
    const now = Date.now();
    useSession.getState().setSession('customer-token', { id: 7 });
    useSession.setState({ authenticatedAt: now - 60_000 });
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/auth/me')) return response({ id: 7, role: 'CUSTOMER' });
      if (String(url).includes('/me/orders?')) return response([{
        id: 31,
        status: 'pending',
        created_at: new Date(now - 30_000).toISOString(),
        hotel: { name: 'Cafe Harbor' },
      }], { total: 1, totalPages: 1 });
      throw new Error(`Unexpected request: ${url}`);
    });

    renderNotifications();

    expect(await screen.findByRole('dialog', { name: 'Order pending' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Your order #31 from Cafe Harbor is pending');
    expect(screen.getByRole('link', { name: 'View order' })).toHaveAttribute('href', '/orders/31');
    expect(global.fetch).toHaveBeenCalledWith('/api/me/orders?page=1&limit=100', expect.any(Object));
  });

  it('alerts when an existing pending order changes to completed', async () => {
    const now = Date.now();
    useSession.getState().setSession('customer-token', { id: 7 });
    useSession.setState({ authenticatedAt: now - 60_000 });
    const pending = {
      id: 32,
      status: 'pending',
      created_at: new Date(now - 120_000).toISOString(),
      hotel: { name: 'Cafe Harbor' },
    };
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/auth/me')) return response({ id: 7, role: 'CUSTOMER' });
      if (String(url).includes('/me/orders?')) return response([pending], { total: 1, totalPages: 1 });
      throw new Error(`Unexpected request: ${url}`);
    });

    const { client } = renderNotifications();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/me/orders?page=1&limit=100', expect.any(Object)));
    expect(await screen.findByRole('dialog', { name: 'Order pending' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    client.setQueryData(['customer-order-notifications', 7], {
      items: [{ ...pending, status: 'completed' }],
      meta: { total: 1, totalPages: 1 },
    });

    expect(await screen.findByRole('dialog', { name: 'Order completed' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Your order #32 from Cafe Harbor is completed');
  });

  it('does not repeat a dismissed order alert after the component is reopened', async () => {
    const now = Date.now();
    useSession.getState().setSession('customer-token', { id: 7 });
    useSession.setState({ authenticatedAt: now - 60_000 });
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/auth/me')) return response({ id: 7, role: 'CUSTOMER' });
      if (String(url).includes('/me/orders?')) return response([{
        id: 35,
        status: 'pending',
        created_at: new Date(now - 30_000).toISOString(),
        hotel: { name: 'Cafe Harbor' },
      }], { total: 1, totalPages: 1 });
      throw new Error(`Unexpected request: ${url}`);
    });

    const first = renderNotifications();
    expect(await screen.findByRole('dialog', { name: 'Order pending' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    first.unmount();

    renderNotifications();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/me/orders?page=1&limit=100', expect.any(Object)));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show customer order history to a hotel administrator', async () => {
    useSession.getState().setSession('hotel-token', { id: 8 });
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/auth/me')) return response({
        id: 8,
        role: 'CUSTOMER',
        admin_of: [{ hotel_id: 4, name: 'Cafe Harbor' }],
      });
      if (String(url).includes('/me/orders?')) return response([{
        id: 33,
        status: 'completed',
        created_at: new Date().toISOString(),
        hotel: { name: 'Cafe Harbor' },
      }], { total: 1, totalPages: 1 });
      throw new Error(`Unexpected request: ${url}`);
    });

    renderNotifications();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/auth/me', expect.any(Object)));
    expect(global.fetch).not.toHaveBeenCalledWith('/api/me/orders?page=1&limit=100', expect.any(Object));
    expect(screen.queryByRole('dialog', { name: 'Order completed' })).not.toBeInTheDocument();
  });
});
