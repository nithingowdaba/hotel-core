import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { useSession } from '../store/session.js';
import { AdminGuard, HotelGuard, PlatformGuard } from '../routes.jsx';
import AdminOrders from './Orders.jsx';
import { NoticeProvider } from './components.jsx';

function renderWithRouter(tree, initialEntries = ['/']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={initialEntries}>{tree}</MemoryRouter></QueryClientProvider>);
}
const ok = (data) => Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });
function OrdersFrame() { return <Outlet context={{ hotelId: '4', hotel: { id: 4, name: 'Cafe' }, suspended: false }} />; }

describe('admin routes and order flow', () => {
  beforeEach(() => { useSession.getState().clearSession(); vi.restoreAllMocks(); });

  it('sends an unauthenticated admin to login with the requested path', async () => {
    renderWithRouter(<Routes><Route path="/admin/:hotelId" element={<AdminGuard />}><Route element={<Outlet />}><Route path="orders" element={<p>orders</p>} /></Route></Route><Route path="/login" element={<p>login{window.location.search}</p>} /></Routes>, ['/admin/12/orders?x=1']);
    expect(await screen.findByText('login')).toBeInTheDocument();
  });

  it('denies a hotel outside the profile', async () => {
    useSession.getState().setSession('token', { id: 1 });
    global.fetch = vi.fn(() => ok({ role: 'HOTEL_ADMIN', admin_of: [{ hotel_id: 8 }] }));
    const tree = <Routes><Route path="/admin/:hotelId" element={<HotelGuard />}><Route path="orders" element={<p>orders</p>} /></Route></Routes>;
    renderWithRouter(tree, ['/admin/12/orders']);
    expect(await screen.findByRole('heading', { name: 'Not authorized' })).toBeInTheDocument();
  });

  it('loads pending orders and completes an order', async () => {
    useSession.getState().setSession('token', { id: 1 });
    global.fetch = vi.fn((url, options = {}) => {
      if (String(url).includes('/auth/me')) return ok({ role: 'HOTEL_ADMIN' });
      if (String(url).includes('/status')) return ok({ id: 21, status: 'completed' });
      if (String(url).includes('/orders?')) return ok({ items: [{ id: 21, status: 'pending', created_at: '2026-11-05T10:00:00Z', customer_name: 'Sam', total_amount: '25.00' }], meta: { total: 1, totalPages: 1 } });
      throw new Error(`Unexpected request: ${url} ${options.method || 'GET'}`);
    });
    renderWithRouter(<NoticeProvider><Routes><Route path="/" element={<OrdersFrame />}><Route index element={<AdminOrders />} /></Route></Routes></NoticeProvider>);
    expect(await screen.findByRole('heading', { name: 'Order #21' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark completed' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/hotels/4/orders/21/status', expect.objectContaining({ method: 'PATCH' })));
    expect(await screen.findByText('Order marked completed.')).toBeInTheDocument();
  });

  it('requires a platform role for platform routes', async () => {
    useSession.getState().setSession('token', { id: 1 });
    global.fetch = vi.fn(() => ok({ role: 'HOTEL_ADMIN' }));
    renderWithRouter(<Routes><Route path="/platform" element={<PlatformGuard />}><Route path="hotels" element={<p>hotels</p>} /></Route></Routes>, ['/platform/hotels']);
    expect(await screen.findByRole('heading', { name: 'Not authorized' })).toBeInTheDocument();
  });

  it('redirects unauthenticated platform routes to login', async () => {
    renderWithRouter(<Routes><Route path="/platform" element={<PlatformGuard />}><Route path="hotels" element={<p>hotels</p>} /></Route><Route path="/login" element={<p>login</p>} /></Routes>, ['/platform/hotels']);
    expect(await screen.findByText('login')).toBeInTheDocument();
  });
});
