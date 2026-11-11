import React from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { useMe } from '../api/hooks.js';
import { adminApi, adminKeys } from './api.js';
import HotelOrderNotifications from './HotelOrderNotifications.jsx';
import { AdminError, AdminLoading, NoticeProvider } from './components.jsx';
import './admin.css';

const hotelTabs = [
  ['overview', 'Overview'], ['orders', 'Orders'], ['menu', 'Menu'], ['reports', 'Reports'], ['settings', 'Settings'],
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
  const hotelStatus = hotelQuery.data?.status;
  const legacyInactive = !platformArea && ['pending', 'rejected'].includes(hotelStatus);
  const hotelName = platformArea ? 'Platform console' : hotelQuery.data?.name || (suspended ? 'Suspended hotel' : `Hotel ${hotelId}`);
  const navItems = platformArea ? [{ path: '/platform/hotels', label: 'All hotels' }, { path: '/platform/metrics', label: 'Platform metrics' }] : hotelTabs.map(([path, label]) => ({ path: `/admin/${hotelId}/${path}`, label }));
  const hotelLinks = me?.admin_of || [];
  const currentHotelPath = platformArea ? '/platform/hotels' : `/admin/${hotelId}/overview`;
  const mobileNavItems = navItems.map((item) => item.path === currentHotelPath ? { ...item, label: 'Home' } : item);
  const breadcrumbs = platformArea ? [{ label: 'Platform', to: '/platform/hotels' }, { label: pathname.includes('/metrics') ? 'Metrics' : 'Hotels', to: '/platform/hotels' }] : [{ label: 'Workspace', to: '/account' }, { label: hotelName, to: currentHotelPath }];

  React.useEffect(() => {
    document.title = `${hotelName} admin · hotel-core`;
  }, [hotelName]);

  return <NoticeProvider><div className="admin-app">
    {!platformArea && me?.role !== 'PLATFORM_ADMIN' && me?.admin_of?.length > 0 && <HotelOrderNotifications memberships={me.admin_of}/>}
    <header className="admin-topbar"><div className="admin-topbar-inner"><Link className="admin-brand" to={currentHotelPath}><span className="admin-brand-mark">hc</span><span>hotel-core <small>workspace</small></span></Link>
      <div className="admin-hotel-select">{platform && !platformArea ? <Link className="button button-secondary" to="/platform/hotels">Platform console <ExternalLink size={16}/></Link> : !platformArea && hotelLinks.length > 1 ? <label><span className="sr-only">Switch hotel</span><select aria-label="Switch hotel" value={hotelId} onChange={(event) => window.location.assign(`/admin/${event.target.value}/overview`)}>{hotelLinks.map((hotel) => <option key={hotel.hotel_id} value={hotel.hotel_id}>{hotel.name || hotel.hotel_name}</option>)}</select><ChevronDown size={16}/></label> : <span>{hotelName}</span>}</div>
      <div className="admin-header-actions">
        <span className="role-heading">{platform ? 'Platform Admin' : 'Hotel Admin'}</span>
        {!platformArea && hotelId ? <Link className="admin-store-link" to={`/hotel/${hotelId}`}>View customer store</Link> : platformArea && <Link className="admin-store-link" to="/">View customer store</Link>}
      </div>
    </div></header>
    <div className="admin-frame">
      <aside className="admin-sidebar">
        <div className="admin-side-title">
          <span>{hotelName}</span>
          {!platformArea && hotelStatus && <span className={`admin-status-badge ${hotelStatus === 'suspended' ? 'status-suspended' : ''}`}>{hotelStatus}</span>}
        </div>
        <nav aria-label="Hotel administration">{navItems.map((item) => <NavLink key={item.path} to={item.path} className={({ isActive }) => isActive ? 'active' : ''}>{item.label}</NavLink>)}</nav>
        {!platformArea && hotelLinks.length > 0 && <div className="admin-side-section"><div className="admin-side-label">My hotels</div>{hotelLinks.map((hotel) => <Link key={hotel.hotel_id} to={`/admin/${hotel.hotel_id}/overview`} className={String(hotel.hotel_id) === String(hotelId) ? 'admin-side-hotel is-current' : 'admin-side-hotel'}>{hotel.name || hotel.hotel_name}</Link>)}</div>}
        {platformArea && <div className="admin-side-section"><div className="admin-side-label">Platform</div><Link className="admin-side-hotel" to="/platform/hotels">All hotels</Link><Link className="admin-side-hotel" to="/platform/metrics">Metrics</Link></div>}
        {!platformArea ? <Link className="admin-back-platform" to={`/hotel/${hotelId}`}>Open customer store →</Link> : <Link className="admin-back-platform" to="/">Open customer store →</Link>}
      </aside>
      <main className="admin-main" id="admin-main">
        <nav className="admin-breadcrumbs" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, index) => <React.Fragment key={crumb.label}>{index > 0 && <span className="admin-breadcrumb-separator">/</span>}<Link to={crumb.to}>{crumb.label}</Link></React.Fragment>)}
        </nav>
        {legacyInactive && <div className="suspended-banner" role="status"><strong>This hotel has a legacy {hotelStatus} status.</strong><span>It is hidden from customers and cannot accept orders. A platform administrator must explicitly activate it.</span></div>}
        {platformArea ? <Outlet context={{ hotelId, hotel: null, suspended: false, queryClient }}/> : hotelQuery.isPending ? <AdminLoading rows={3}/> : hotelQuery.isError || !hotelQuery.data ? <AdminError error={hotelQuery.error || { message: 'Hotel not found.' }} retry={() => hotelQuery.refetch()}/> : legacyInactive && pathname.endsWith('/orders') ? <section className="admin-page"><h1>Orders unavailable</h1><p>This legacy hotel must be activated by a platform administrator before customers can order.</p><Link className="button button-primary" to={`/admin/${hotelId}/settings`}>Open hotel settings</Link></section> : <Outlet context={{ hotel: hotelQuery.data, hotelId, suspended, queryClient }}/>}
      </main>
    </div>
    <nav className="admin-mobile-tabs" aria-label="Hotel administration" hidden={typeof window !== 'undefined' && window.innerWidth >= 1024}>{mobileNavItems.map((item) => <NavLink key={item.path} to={item.path} end={item.path === currentHotelPath} className={({ isActive }) => isActive ? 'active' : ''}>{item.label}</NavLink>)}</nav>
  </div></NoticeProvider>;
}
