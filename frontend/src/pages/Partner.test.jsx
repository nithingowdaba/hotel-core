import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Partner from './Partner.jsx';
import { useSession } from '../store/session.js';

function renderPartner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><Partner/></MemoryRouter></QueryClientProvider>);
}

describe('hotel partner registration', () => {
  beforeEach(() => {
    useSession.getState().clearSession();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    useSession.getState().clearSession();
    vi.unstubAllGlobals();
  });

  it('keeps the account field node and focus stable while entering registration details', async () => {
    const user = userEvent.setup();
    renderPartner();
    const email = screen.getByRole('textbox', { name: 'Email' });
    await user.click(email);
    const original = email;
    await user.type(email, 'owner@example.test');
    expect(screen.getByRole('textbox', { name: 'Email' })).toBe(original);
    expect(document.activeElement).toBe(original);
    expect(original).toHaveValue('owner@example.test');
  });

  it('submits owner and hotel details, then establishes the returned owner session', async () => {
    const user = userEvent.setup();
    global.fetch.mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ success: true, data: {
        token: 'owner-token', user: { id: 12, full_name: 'Owner', email: 'owner@example.test' },
        hotel: { id: 35, status: 'pending' },
      } }),
    });
    renderPartner();
    await user.type(screen.getByRole('textbox', { name: 'Owner name' }), 'Owner');
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'owner@example.test');
    await user.type(screen.getByLabelText('Password'), 'Partner-pass-0123');
    await user.type(screen.getByRole('textbox', { name: 'Hotel name' }), 'Sample Hotel');
    await user.type(screen.getByRole('textbox', { name: 'Phone' }), '9000000000');
    await user.click(screen.getByRole('button', { name: 'Submit hotel for review' }));
    await screen.findByRole('heading', { name: 'Bring your hotel to Hotel Core' });
    expect(global.fetch).toHaveBeenCalledWith('/api/hotels/register', expect.objectContaining({ method: 'POST' }));
    expect(useSession.getState().token).toBe('owner-token');
  });

  it('omits the account form for an authenticated user', () => {
    useSession.getState().setSession('existing-token', { id: 9 });
    renderPartner();
    expect(screen.queryByRole('textbox', { name: 'Owner name' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });
});
