import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { useSession } from '../store/session.js';
import AdminMenu from './Menu.jsx';

function HotelFrame() {
  return <Outlet context={{ hotelId: '4', suspended: false }}/>;
}

function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/4/menu']}><Routes><Route path="/admin/:hotelId" element={<HotelFrame/>}><Route path="menu" element={<AdminMenu/>}/></Route></Routes></MemoryRouter></QueryClientProvider>);
}

describe('hotel admin menu availability filter', () => {
  beforeEach(() => {
    useSession.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('filters already-loaded menu items without requesting other hotel data', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          categories: [
            { name: 'Breakfast', items: [{ id: 1, name: 'Masala dosa', price: '90.00', is_veg: true, is_available: true }] },
            { name: 'Meals', items: [{ id: 2, name: 'Veg thali', price: '150.00', is_veg: true, is_available: false }] },
          ],
        },
      }),
    }));

    renderMenu();

    expect(await screen.findByRole('heading', { name: 'Masala dosa' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Veg thali' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by availability' }), { target: { value: 'sold-out' } });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Masala dosa' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Veg thali' })).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/hotels/4/menu', expect.any(Object));
  });

  it('explains when a filter has no matching items', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { categories: [{ name: 'Breakfast', items: [{ id: 1, name: 'Masala dosa', price: '90.00', is_veg: true, is_available: true }] }] } }),
    }));

    renderMenu();
    await screen.findByRole('heading', { name: 'Masala dosa' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by availability' }), { target: { value: 'sold-out' } });

    expect(await screen.findByText('Try another search, category, or availability filter.')).toBeInTheDocument();
  });
});
