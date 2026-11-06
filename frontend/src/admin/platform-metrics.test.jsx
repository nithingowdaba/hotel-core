import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlatformMetrics from './PlatformMetrics.jsx';
import { useSession } from '../store/session.js';

describe('platform hotel metrics', () => {
  afterEach(() => {
    useSession.getState().clearSession();
    vi.unstubAllGlobals();
  });

  it('prioritizes total, active, suspended, and separately labeled legacy counts', async () => {
    useSession.getState().setSession('platform-token', { id: 1, role: 'PLATFORM_ADMIN' });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {
        total_hotels: 9,
        active_hotels: 6,
        suspended_hotels: 2,
        legacy_pending_hotels: 1,
        legacy_rejected_hotels: 0,
        uptime_seconds: 10,
        routes: [],
      } }),
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><PlatformMetrics/></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText('Total hotels')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Active hotels')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Suspended hotels')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Legacy pending · admin activation only')).toBeInTheDocument();
    expect(screen.getByText('Legacy rejected · admin activation only')).toBeInTheDocument();
  });
});
