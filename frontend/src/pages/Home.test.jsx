import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home.jsx';
import { useSession } from '../store/session.js';

describe('public hotel discovery', () => {
  beforeEach(() => {
    useSession.getState().clearSession();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [{ id: 4, name: 'Biriyani Palace', slug: 'biriyani-palace', cuisines: 'Biriyani, Kebab.', accepting_orders: true }],
        meta: { total: 4, page: 1, limit: 20, totalPages: 1 },
      }),
    }));
  });

  afterEach(() => {
    useSession.getState().clearSession();
    vi.unstubAllGlobals();
  });

  it('renders active hotel records from the public paginated API response', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><Home /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: 'Biriyani Palace' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register a hotel' })).toHaveAttribute('href', '/partner');
    expect(screen.getByText('4 places')).toBeInTheDocument();
    expect(screen.queryByText('No hotels yet')).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/hotels?search=&page=1&limit=20', expect.any(Object));
  });

  it('keeps the previous hotel list while a search refresh is pending', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><Home /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: 'Biriyani Palace' })).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Search hotels or cuisines');
    fireEvent.change(searchInput, { target: { value: 'bir' } });

    await waitFor(() => {
      expect(screen.getByText('4 places')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Biriyani Palace' })).toBeInTheDocument();
      expect(screen.queryByText('No hotels yet')).not.toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it('shows hotel-specific order shortcuts for a signed-in hotel admin', async () => {
    useSession.getState().setSession('admin-token', { id: 8, role: 'HOTEL_ADMIN' });
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/auth/me')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              id: 8,
              role: 'HOTEL_ADMIN',
              admin_of: [
                { hotel_id: 4, name: 'Biriyani Palace' },
                { hotel_id: 7, name: 'Cafe Harbor' },
              ],
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [{ id: 4, name: 'Biriyani Palace', slug: 'biriyani-palace', cuisines: 'Biriyani', accepting_orders: true }],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        }),
      });
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><Home /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByRole('link', { name: 'Manage orders · Biriyani Palace' })).toHaveAttribute('href', '/admin/4/orders');
    expect(screen.getByRole('link', { name: 'Manage orders · Cafe Harbor' })).toHaveAttribute('href', '/admin/7/orders');
  });

  it('does not show hotel order shortcuts to a customer', async () => {
    useSession.getState().setSession('customer-token', { id: 9, role: 'CUSTOMER' });
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/auth/me')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { id: 9, role: 'CUSTOMER', admin_of: [] } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } }),
      });
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><Home /></MemoryRouter></QueryClientProvider>);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/auth/me', expect.any(Object)));
    expect(screen.queryByRole('link', { name: /manage orders/i })).not.toBeInTheDocument();
  });
});
