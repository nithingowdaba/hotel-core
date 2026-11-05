import React from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { useMe } from '../api/hooks.js';
import { useSession } from '../store/session.js';
import { adminApi, adminKeys, displayError } from './api.js';
import { AdminError, AdminLoading, NoticeProvider } from './components.jsx';
import './admin.css';

const tabs = [
  ['orders', 'Live orders'], ['menu', 'Menu'], ['reports', 'Reports'], ['settings', 'Settings'],
];

export default function AdminShell() {
  const { hotelId } = useParams();
  const { pathname } = useLocation();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const platform = me?.role === 'PLATFORM_ADMIN';
  const platformArea = pathname === '/platform' || pathname.startsWith('/platform/');
  const hotelQuery = useQuery({
    queryKey: adminKeys.hotel(hotelId),
    queryFn: async () => {
      try { return await adminApi.hotel(hotelId); }
      catch (error) {
        if (!platform || ![403, 404].includes(error.status)) throw error;
        const data = await adminApi.hotels({ page: 1, limit: 100 });
        return (data.items || data.data || []).find((hotel) => String(hotel.id) === String(hotelId));
      }
    },
    enabled: Boolean(hotelId) && !platformArea,
    retry: (count, error) => error.status >= 400 && error.status < 500 ? false : count < 1,
  });
  const suspended = !platformArea && (hotelQuery.data?.status === 'suspended' || ['HOTEL_SUSPENDED', 'HOTEL_NOT_FOUND'].includes(hotelQuery.error?.code) || [403, 404].includes(hotelQuery.error?.status));
  const hotelName = platformArea ? 'Platform console' : hotelQuery.data?.name || (suspended ? 'Suspended hotel' : `Hotel ${hotelId}`);
  React.useEffect(() => {
    document.title = `${hotelName} admin · hotel-core`;
  }, [hotelName]);
  const navItems = platformArea ? [{ path: '/platform/hotels', label: 'Hotels' }, { path: '/platform/metrics', label: 'Metrics' }] : tabs.map(([path, label]) => ({ path: `/admin/${hotelId}/${path}`, label }));
  const activeTitle = tabs.find(([key]) => pathname.endsWith(`/${key}`))?.[1] || 'Live orders';
  const hotelLinks = me?.admin_of || [];
  return <NoticeProvider><div className="admin-app">
    <header className="admin-topbar"><div className="admin-topbar-inner"><Link className="admin-brand" to="/account"><span className="admin-brand-mark">hc</span><span>hotel-core <small>workspace</small></span></Link>
      <div className="admin-hotel-select">{platform && !platformArea ? <Link className="button button-secondary" to="/platform/hotels">Platform console <ExternalLink size={16}/></Link> : !platformArea && hotelLinks.length > 1 ? <label><span className="sr-only">Switch hotel</span><select aria-label="Switch hotel" value={hotelId} onChange={(event) => window.location.assign(`/admin/${event.target.value}/orders`)}>{hotelLinks.map((hotel) => <option key={hotel.hotel_id} value={hotel.hotel_id}>{hotel.name || hotel.hotel_name}</option>)}</select><ChevronDown size={16}/></label> : <span>{hotelName}</span>}</div>
      <Link className="admin-account-link" to="/account">Account</Link>
    </div></header>
    <div className="admin-frame">
      <aside className="admin-sidebar"><div className="admin-side-title">{hotelName}</div><nav aria-label="Hotel administration">{navItems.map((item) => <NavLink key={item.path} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>{item.label}</NavLink>)}</nav>{platform && <Link className="admin-back-platform" to="/platform/hotels">Platform console →</Link>}</aside>
      <main className="admin-main" id="admin-main">
        {suspended && <div className="suspended-banner" role="alert"><strong>This hotel is suspended by the platform.</strong><span>All write actions are disabled until the platform reactivates it.</span></div>}
        {platformArea ? <Outlet context={{ hotelId, hotel: null, suspended: false, queryClient }}/> : hotelQuery.isPending ? <AdminLoading rows={3}/> : hotelQuery.isError || !hotelQuery.data ? <AdminError error={hotelQuery.error || { message: 'Hotel not found.' }} retry={() => hotelQuery.refetch()}/> : <Outlet context={{ hotel: hotelQuery.data, hotelId, suspended, queryClient }}/>}
      </main>
    </div>
    <nav className="admin-mobile-tabs" aria-label="Hotel administration">{navItems.map((item) => <NavLink key={item.path} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>{item.label}</NavLink>)}</nav>
  </div></NoticeProvider>;
}
