import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import PlatformHotels from './PlatformHotels.jsx';
import { useSession } from '../store/session.js';

const result = (data, meta) => ({ ok: true, status: 200, json: async () => ({ success: true, data, meta }) });

describe('platform hotel listing search', () => {
  beforeEach(() => {
    useSession.getState().setSession('platform-token', { id: 1, role: 'PLATFORM_ADMIN' });
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      const parsed = new URL(String(url), 'http://hotel.test');
      if (/\/api\/platform\/hotels\/\d+$/.test(parsed.pathname) && options.method === 'PATCH') {
        return result({ id: 22, name: 'Status Hotel', status: JSON.parse(options.body).status });
      }
      if (parsed.pathname !== '/api/platform/hotels') throw new Error(`Unexpected request: ${url}`);
      const page = Number(parsed.searchParams.get('page'));
      const search = parsed.searchParams.get('search');
      if (parsed.searchParams.get('status') === 'pending') return result([{ id: 22, name: 'Legacy Hotel', slug: 'legacy-hotel', status: 'pending' }], { total: 1, totalPages: 1, page: 1 });
      if (parsed.searchParams.get('status') === 'suspended') return result([{ id: 22, name: 'Suspended Hotel', slug: 'suspended-hotel', status: 'suspended' }], { total: 1, totalPages: 1, page: 1 });
      if (!search && page === 1) return result(Array.from({ length: 20 }, (_, index) => ({ id: index + 1, name: `Hotel ${index + 1}`, slug: `hotel-${index + 1}`, status: 'active' })), { total: 21, totalPages: 2, page: 1 });
      if (!search && page === 2) return result([{ id: 21, name: 'Target Hotel', slug: 'target-hotel', status: 'active' }], { total: 21, totalPages: 2, page: 2 });
      if (search === 'Target Hotel' && page === 1) return result([{ id: 21, name: 'Target Hotel', slug: 'target-hotel', status: 'active' }], { total: 1, totalPages: 1, page: 1 });
      if (search === 'No Such Hotel' && page === 1) return result([], { total: 0, totalPages: 0, page: 1 });
      throw new Error(`Unexpected listing query: ${parsed.search}`);
    }));
  });
  afterEach(() => {
    useSession.getState().clearSession();
    vi.unstubAllGlobals();
  });

  it('searches across all hotels, resets to page one, and preserves management controls', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><PlatformHotels/></MemoryRouter></QueryClientProvider>);
    expect((await screen.findAllByText('Hotel 1')).length).toBeGreaterThan(0);
    expect(global.fetch.mock.calls[0][0]).toContain('page=1&limit=20');

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect((await screen.findAllByText('Target Hotel')).length).toBeGreaterThan(0);
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('page=2&limit=20'))).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search hotels' }), { target: { value: 'Target Hotel' } });
    expect((await screen.findAllByText('Target Hotel')).length).toBeGreaterThan(0);
    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => {
      const parsed = new URL(String(url), 'http://hotel.test');
      return parsed.searchParams.get('search') === 'Target Hotel' && parsed.searchParams.get('page') === '1';
    })).toBe(true));
    expect(screen.getByText('1 hotels')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Manage' }).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search hotels' }), { target: { value: 'No Such Hotel' } });
    expect(await screen.findByText('No matching hotels')).toBeInTheDocument();
    expect(screen.getByText('0 hotels')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search hotels' }), { target: { value: '' } });
    expect((await screen.findAllByText('Hotel 1')).length).toBeGreaterThan(0);
    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => {
      const parsed = new URL(String(url), 'http://hotel.test');
      return parsed.searchParams.get('page') === '1' && !parsed.searchParams.has('search');
    })).toBe(true));
  });

  it('searches the legacy status filter and requires explicit confirmation to activate a legacy hotel', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><PlatformHotels/></MemoryRouter></QueryClientProvider>);
    await screen.findAllByText('Hotel 1');
    fireEvent.change(screen.getByRole('combobox', { name: 'Hotel status filter' }), { target: { value: 'pending' } });
    expect((await screen.findAllByText('Legacy Hotel')).length).toBeGreaterThan(0);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Activate legacy hotel' }))[0]);
    expect(screen.getByRole('dialog', { name: 'Activate legacy hotel?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activate hotel' }));
    await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) =>
      /\/api\/platform\/hotels\/\d+$/.test(new URL(String(url), 'http://hotel.test').pathname)
      && options.method === 'PATCH' && JSON.parse(options.body).status === 'active')).toBe(true));
  });

  it('confirms suspension and reactivation and displays the suspended state', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><PlatformHotels/></MemoryRouter></QueryClientProvider>);
    await screen.findAllByText('Hotel 1');
    fireEvent.change(screen.getByRole('combobox', { name: 'Hotel status filter' }), { target: { value: 'suspended' } });
    expect((await screen.findAllByText('Suspended Hotel')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('suspended').length).toBeGreaterThan(0);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Reactivate' }))[0]);
    expect(screen.getByRole('dialog', { name: 'Reactivate this hotel?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate hotel' }));
    await waitFor(() => expect(global.fetch.mock.calls.some(([url, options]) =>
      /\/api\/platform\/hotels\/\d+$/.test(new URL(String(url), 'http://hotel.test').pathname)
      && options.method === 'PATCH' && JSON.parse(options.body).status === 'active')).toBe(true));
  });
});
