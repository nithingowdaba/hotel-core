import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import Shell from './components/Shell.jsx';
import AdminShell from './admin/AdminShell.jsx';
import { useSession } from './store/session.js';

function renderShell(initialEntries = ['/']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/" element={<Shell />}>
            <Route index element={<div>Home content</div>} />
            <Route path="search" element={<div>Search content</div>} />
            <Route path="orders" element={<div>Orders content</div>} />
            <Route path="account" element={<div>Account content</div>} />
            <Route path="partner" element={<div>Partner content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('navigation experience', () => {
  beforeEach(() => {
    useSession.getState().clearSession();
    vi.unstubAllGlobals();
  });

  it('shows the customer shell navigation for unauthenticated shoppers', () => {
    renderShell();

    expect(screen.getByRole('link', { name: /hotel-core home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /browse hotels/i })).toHaveAttribute('href', '/search');
    expect(screen.getByRole('link', { name: /partner with us/i })).toHaveAttribute('href', '/partner');
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /create account/i })).toHaveAttribute('href', '/login');
  });

  it('shows order and account links for authenticated shoppers', () => {
    useSession.getState().setSession('token', { id: 7 });
    renderShell();

    expect(screen.getByRole('link', { name: /my orders/i })).toHaveAttribute('href', '/orders');
    expect(screen.getByRole('link', { name: /my account/i })).toHaveAttribute('href', '/account');
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('shows hotel owner navigation and a hotel switcher', async () => {
    useSession.getState().setSession('token', { id: 7 });
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/auth/me')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { id: 7, role: 'HOTEL_ADMIN', admin_of: [{ hotel_id: 12, name: 'Harbor Hotel' }, { hotel_id: 17, name: 'Rooftop Kitchen' }] } }),
        });
      }
      if (String(url).includes('/api/hotels/12')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { id: 12, name: 'Harbor Hotel', status: 'active' } }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) });
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/12/orders']}>
          <Routes>
            <Route path="/admin/:hotelId/*" element={<AdminShell />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('link', { name: /orders/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /menu/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view customer store/i })).toHaveAttribute('href', '/hotel/12');
    await waitFor(() => expect(screen.getByRole('combobox', { name: /switch hotel/i })).toBeInTheDocument());
  });
});
