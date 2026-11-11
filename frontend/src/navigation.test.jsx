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
            <Route path="admin/:hotelId/orders" element={<div>Admin orders</div>} />
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
    const { container } = renderShell();

    expect(screen.getByRole('link', { name: /hotel-core home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('navigation', { name: 'Customer navigation' })).toContainElement(screen.getByRole('link', { name: 'Home' }));
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: /browse hotels|^search$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /partner with us/i })).not.toBeInTheDocument();
    expect(container.querySelector('.header-auth-link[aria-label="Log in"]')).toHaveAttribute('href', '/login');
    expect(container.querySelector('.header-auth-link[aria-label="Create account"]')).toHaveAttribute('href', '/login?mode=register');
    expect(screen.queryByRole('link', { name: /cart/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open menu|close menu/i })).not.toBeInTheDocument();
  });

  it('hides the customer header inside the admin workspace', () => {
    const { container } = renderShell(['/admin/4/orders']);

    expect(screen.getByText('Admin orders')).toBeInTheDocument();
    expect(container.querySelector('.topbar')).not.toBeInTheDocument();
    expect(container.querySelector('.customer-home-tabs')).not.toBeInTheDocument();
  });

  it('shows the customer Home shortcut in the bottom taskbar on inner pages', () => {
    renderShell(['/orders']);

    expect(screen.getByRole('navigation', { name: 'Customer navigation' })).toContainElement(screen.getByRole('link', { name: 'Home' }));
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });

  it('shows the profile icon and cart for authenticated shoppers without account or orders navigation buttons', async () => {
    useSession.getState().setSession('token', { id: 7, role: 'CUSTOMER' });
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 7, role: 'CUSTOMER' } }),
    }));
    renderShell();

    expect(screen.queryByRole('link', { name: /my account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^account$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my orders|^orders$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Account profile' })).toHaveAttribute('href', '/account');
    expect(await screen.findByRole('link', { name: /cart, 0 items/i })).toHaveAttribute('href', '/cart');
    expect(screen.queryByRole('link', { name: /^account$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();
  });

  it('hides the cart for platform administrators', () => {
    useSession.getState().setSession('token', { id: 7, role: 'PLATFORM_ADMIN' });
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 7, role: 'PLATFORM_ADMIN' } }),
    }));
    renderShell();

    expect(screen.getByText('Platform Admin')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /cart/i })).not.toBeInTheDocument();
  });

  it('hides the cart for hotel administrators', () => {
    useSession.getState().setSession('token', { id: 7, role: 'HOTEL_ADMIN' });
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 7, role: 'HOTEL_ADMIN', admin_of: [{ hotel_id: 12, name: 'Harbor Hotel' }] } }),
    }));
    renderShell();

    expect(screen.getByText('Hotel Admin')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /cart/i })).not.toBeInTheDocument();
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
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/12/orders']}>
          <Routes>
            <Route path="/admin/:hotelId/*" element={<AdminShell />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('link', { name: /orders/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /menu/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view customer store/i })).toHaveAttribute('href', '/hotel/12');
    expect(screen.getByRole('link', { name: /hotel-core workspace/i })).toHaveAttribute('href', '/admin/12/overview');
    expect(container.querySelector('.admin-mobile-tabs a')?.textContent).toBe('Home');
    expect(container.querySelector('.admin-mobile-tabs a')?.getAttribute('href')).toBe('/admin/12/overview');
    expect(screen.getByText('Hotel Admin')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox', { name: /switch hotel/i })).toBeInTheDocument());
  });

  it('shows the platform administrator heading in the platform workspace', async () => {
    useSession.getState().setSession('token', { id: 7, role: 'PLATFORM_ADMIN' });
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 7, role: 'PLATFORM_ADMIN' } }),
    }));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/platform/hotels']}>
          <Routes>
            <Route path="/platform/*" element={<AdminShell />}>
              <Route path="hotels" element={<div>Hotels page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Platform Admin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /hotel-core workspace/i })).toHaveAttribute('href', '/platform/hotels');
    expect(container.querySelector('.admin-mobile-tabs a')?.textContent).toBe('Home');
    expect(container.querySelector('.admin-mobile-tabs a')?.getAttribute('href')).toBe('/platform/hotels');
  });
});
