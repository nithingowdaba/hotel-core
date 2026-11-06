import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home.jsx';

describe('public hotel discovery', () => {
  beforeEach(() => {
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

  afterEach(() => vi.unstubAllGlobals());

  it('renders active hotel records from the public paginated API response', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><Home /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: 'Biriyani Palace' })).toBeInTheDocument();
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
});
