import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { useSession } from '../store/session.js';
import AdminOverview from './Overview.jsx';

function HotelFrame() {
  return <Outlet context={{ hotelId: '4', hotel: { id: 4, name: 'Cafe Harbor' }, suspended: false }}/>;
}

function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/4/overview']}><Routes><Route path="/admin/:hotelId" element={<HotelFrame/>}><Route path="overview" element={<AdminOverview/>}/></Route></Routes></MemoryRouter></QueryClientProvider>);
}

const response = (data, meta) => Promise.resolve({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data, ...(meta ? { meta } : {}) }),
});

describe('hotel admin overview', () => {
  beforeEach(() => {
    useSession.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('loads hotel-scoped sales, top items, and pending orders', async () => {
    useSession.getState().setSession('hotel-token', { id: 2 });
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/reports/daily-sales')) {
        return response({ completed_order_count: 3, total_sales: '1250.00' });
      }
      if (String(url).includes('/reports/top-selling-items')) {
        return response([{ menu_item_id: 7, item_name: 'Masala dosa', quantity_sold: 6 }]);
      }
      if (String(url).includes('/orders?')) {
        return response([{ id: 21, customer_name: 'Sam', created_at: '2026-11-05T10:00:00Z', total_amount: '250.00', items_summary: 'Masala dosa x1' }], { total: 2, totalPages: 1 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderOverview();

    expect(await screen.findByText('Masala dosa')).toBeInTheDocument();
    expect(await screen.findByText('Order #21')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/1,250/)).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    const requestedUrls = global.fetch.mock.calls.map(([url]) => String(url));
    expect(requestedUrls.every((url) => url.includes('/api/hotels/4/'))).toBe(true);
    expect(requestedUrls.some((url) => url.includes('/reports/daily-sales?date='))).toBe(true);
    expect(requestedUrls.some((url) => url.includes('/reports/top-selling-items?from='))).toBe(true);
    expect(requestedUrls).toContain('/api/hotels/4/orders?status=pending&page=1&limit=5');
  });

  it('shows an empty state when the hotel has no pending orders or sales', async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/reports/daily-sales')) return response({ completed_order_count: 0, total_sales: '0.00' });
      if (String(url).includes('/reports/top-selling-items')) return response([]);
      if (String(url).includes('/orders?')) return response([], { total: 0, totalPages: 0 });
      throw new Error(`Unexpected request: ${url}`);
    });

    renderOverview();

    expect(await screen.findByText('No pending orders')).toBeInTheDocument();
    expect(screen.getByText('No completed sales this week')).toBeInTheDocument();
  });
});
