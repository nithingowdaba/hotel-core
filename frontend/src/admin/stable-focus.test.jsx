import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import AdminMenu from './Menu.jsx';
import AdminSettings from './Settings.jsx';
import PlatformHotels from './PlatformHotels.jsx';
import PlatformHotelDetail from './PlatformHotelDetail.jsx';
import { ConfirmDialog, NoticeProvider } from './components.jsx';
import { useSession } from '../store/session.js';
import { useCart } from '../store/cart.js';
import { expectStableTypingFocus } from '../test/stable-typing.js';
import Auth from '../pages/Auth.jsx';
import Cart from '../pages/Cart.jsx';

const hotel = { id: 4, name: 'Cafe', slug: 'cafe', cuisines: '', address: '', phone: '', description: '', logo_url: '', cover_url: '', accepting_orders: true, status: 'active' };
const menuData = { categories: [{ name: 'Mains', items: [] }] };
const success = (data, meta) => Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data, ...(meta ? { meta } : {}) }) });
function QueryRouter({ children, initialEntries = ['/'] }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}><NoticeProvider><MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter></NoticeProvider></QueryClientProvider>;
}
function HotelFrame({ children }) { return <Outlet context={{ hotelId: '4', hotel, suspended: false }} />; }
function ConfirmHarness() {
  const [open, setOpen] = React.useState(false);
  return <><button type="button" onClick={() => setOpen(true)}>Open confirmation</button>{open && <ConfirmDialog title="Confirm action" onClose={() => setOpen(false)} onConfirm={() => setOpen(false)}>Continue?</ConfirmDialog>}</>;
}
const detailRoutes = (children) => <Routes><Route path="/platform/hotels/:hotelId" element={children}/></Routes>;
const hotelList = { items: [hotel], meta: { total: 1, totalPages: 1 } };
function mockPlatformApi({ admins = [], postResponse = { id: 10 } } = {}) {
  const requests = [];
  global.fetch = vi.fn((url, options = {}) => {
    const path = String(url);
    requests.push({ path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
    if (path.startsWith('/api/platform/hotels?')) return success(hotelList.items, hotelList.meta);
    if (path.endsWith('/admins?page=1&limit=20')) return success(admins, { total: admins.length, totalPages: 1 });
    if (path.endsWith('/admins') && options.method === 'POST') return success(postResponse);
    if (path.includes('/admins/')) return success({});
    if (path.includes('/platform/hotels/')) return Promise.reject(new Error(`Unexpected detail request: ${path}`));
    if (path.startsWith('/api/hotels/4/menu')) return success(menuData);
    if (path.startsWith('/api/hotels/4')) return success(hotel);
    throw new Error(`Unexpected request: ${path}`);
  });
  return requests;
}
function renderDetail() {
  return render(<QueryRouter initialEntries={['/platform/hotels/4']}>{detailRoutes(<PlatformHotelDetail/>)}</QueryRouter>);
}
async function openAddAdmin() {
  const user = userEvent.setup();
  renderDetail();
  await user.click(await screen.findByRole('button', { name: 'Add admin' }));
  return { user };
}

describe('stable input focus across forms and overlays', () => {
  beforeEach(() => { useSession.getState().clearSession(); useCart.getState().clear(); vi.restoreAllMocks(); });

  it('keeps focus and node identity for every Add admin field in link mode', async () => {
    mockPlatformApi();
    await expectStableTypingFocus(openAddAdmin, ['User ID']);
  });

  it('keeps focus and node identity for every Add admin field in create mode', async () => {
    mockPlatformApi();
    await expectStableTypingFocus(async () => {
      const { user } = await openAddAdmin();
      await user.click(screen.getByRole('tab', { name: 'Create new admin' }));
      return { user };
    }, ['Full name', 'Email', 'Phone', 'Password']);
  });

  it('keeps link and create values when switching modes', async () => {
    mockPlatformApi();
    const { user } = await openAddAdmin();
    const userId = screen.getByLabelText(/User ID/);
    await user.type(userId, '12345');
    await user.click(screen.getByRole('tab', { name: 'Create new admin' }));
    const email = screen.getByLabelText('Email');
    await user.type(email, 'asha@example.test');
    await user.click(screen.getByRole('tab', { name: 'Link existing user' }));
    expect(screen.getByLabelText('User ID')).toHaveValue('12345');
    await user.click(screen.getByRole('tab', { name: 'Create new admin' }));
    expect(screen.getByLabelText('Email')).toHaveValue('asha@example.test');
  });

  it('keeps the password input node through visibility toggle and continued typing', async () => {
    mockPlatformApi();
    const { user } = await openAddAdmin();
    await user.click(screen.getByRole('tab', { name: 'Create new admin' }));
    const password = screen.getByLabelText('Password');
    await user.type(password, 'Asha Rao');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toBe(password);
    await user.type(password, ' 9');
    expect(password).toHaveValue('Asha Rao 9');
  });

  it('sends only the selected Add admin request shape and preserves focus on validation errors', async () => {
    const requests = mockPlatformApi();
    const { user } = await openAddAdmin();
    await user.click(screen.getByRole('button', { name: 'Link user' }));
    const userId = screen.getByLabelText(/User ID/);
    await user.type(userId, 'x');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Enter a positive user ID.')).toBeInTheDocument();
    expect(document.activeElement).toBe(userId);
    expect(userId).toHaveValue('x');
    await user.clear(userId);
    await user.type(userId, '123');
    await user.click(screen.getByRole('button', { name: 'Link user' }));
    await waitFor(() => expect(requests.find((request) => request.method === 'POST')?.body).toEqual({ user_id: 123 }));
    expect(requests.find((request) => request.method === 'POST').body).not.toHaveProperty('email');
  });

  it('sends only create-mode fields when adding a new admin', async () => {
    const requests = mockPlatformApi();
    const { user } = await openAddAdmin();
    await user.click(screen.getByRole('tab', { name: 'Create new admin' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Full name'), 'Asha Rao');
    await user.type(dialog.getByLabelText('Email'), 'asha@example.test');
    await user.type(dialog.getByLabelText('Phone'), '9876543210');
    await user.type(dialog.getByLabelText('Password'), 'Password9');
    await user.click(screen.getByRole('button', { name: 'Create admin' }));
    await waitFor(() => expect(requests.find((request) => request.method === 'POST')?.body).toEqual({ full_name: 'Asha Rao', email: 'asha@example.test', phone: '9876543210', password: 'Password9' }));
    expect(requests.find((request) => request.method === 'POST').body).not.toHaveProperty('user_id');
  });

  it('closes Add admin on Escape and restores focus to its trigger', async () => {
    mockPlatformApi();
    const { user } = await openAddAdmin();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Add admin' })).toHaveFocus();
  });

  it('keeps the ConfirmDialog Escape and focus restore behavior', async () => {
    const user = userEvent.setup();
    render(<QueryRouter><ConfirmHarness/></QueryRouter>);
    const trigger = screen.getByRole('button', { name: 'Open confirmation' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('keeps Cart payment selection focused on the same radio after state updates', async () => {
    useCart.getState().add({ id: 4, name: 'Cafe' }, { id: 7, name: 'Dosa', price: 25, is_veg: true });
    global.fetch = vi.fn(() => success(hotel));
    const user = userEvent.setup();
    render(<QueryRouter><Routes><Route path="/" element={<Cart/>}/></Routes></QueryRouter>);
    const upi = screen.getByRole('radio', { name: 'UPI' });
    await user.click(upi);
    expect(screen.getByRole('radio', { name: 'UPI' })).toBe(upi);
    expect(upi).toBeChecked();
    expect(document.activeElement).toBe(upi);
  });

  it('keeps focus stable in Create hotel dialog fields', async () => {
    mockPlatformApi();
    await expectStableTypingFocus(async () => {
      const user = userEvent.setup();
      render(<QueryRouter initialEntries={['/platform/hotels']}><Routes><Route path="/platform/hotels" element={<PlatformHotels/>}/></Routes></QueryRouter>);
      await user.click(await screen.findByRole('button', { name: 'Create hotel' }));
      return { user };
    }, ['Hotel name', 'Slug (optional)', 'Cuisines', 'Phone', 'Address', 'Description']);
  });

  it('keeps focus stable in hotel profile fields', async () => {
    mockPlatformApi();
    await expectStableTypingFocus(async () => { const user = userEvent.setup(); renderDetail(); await screen.findByRole('heading', { name: 'Cafe' }); return { user }; }, ['Name', 'Cuisines', 'Phone', 'Address', 'Description', 'Logo URL (secure HTTPS only)', 'Cover URL (secure HTTPS only)']);
  });

  it('keeps focus stable in menu item Sheet fields', async () => {
    mockPlatformApi();
    await expectStableTypingFocus(async () => {
      const user = userEvent.setup();
      render(<QueryRouter><Routes><Route path="/" element={<HotelFrame/>}><Route index element={<AdminMenu/>}/></Route></Routes></QueryRouter>);
      await user.click(await screen.findByRole('button', { name: 'Add item' }));
      return { user };
    }, ['Item name', 'Category', 'Price (₹)', 'Description', 'Image URL (secure HTTPS only)']);
  });

  it('keeps focus stable in Settings fields', async () => {
    mockPlatformApi();
    await expectStableTypingFocus(async () => {
      const user = userEvent.setup();
      render(<QueryRouter><Routes><Route path="/" element={<HotelFrame/>}><Route index element={<AdminSettings/>}/></Route></Routes></QueryRouter>);
      await screen.findByRole('heading', { name: 'Hotel settings' });
      return { user };
    }, ['Description', 'Cuisines', 'Phone', 'Address', 'Logo URL (secure HTTPS only)', 'Cover URL (secure HTTPS only)']);
  });

  it('keeps focus stable in Login and Register fields', async () => {
    await expectStableTypingFocus(async () => {
      const user = userEvent.setup();
      render(<QueryRouter><Routes><Route path="/" element={<Auth/>}/></Routes></QueryRouter>);
      return { user };
    }, ['Email', 'Password']);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await expectStableTypingFocus(async () => ({ user }), ['Full name', 'Email', 'Phone number', 'Password']);
  });
});
