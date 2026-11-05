import React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, Search, ClipboardList, UserRound, ShoppingBag } from 'lucide-react';
import { useCart } from '../store/cart.js';
import { useSession } from '../store/session.js';
import { Toast } from './ui/index.jsx';
const tabs = [['/', 'Home', Home], ['/search', 'Search', Search], ['/orders', 'Orders', ClipboardList], ['/account', 'Account', UserRound]];
export default function Shell() {
  const cart = useCart(); const token = useSession((s) => s.token); const [offline, setOffline] = React.useState(!navigator.onLine); const location = useLocation();
  React.useEffect(() => { const on = () => setOffline(false); const off = () => setOffline(true); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  React.useEffect(() => { window.scrollTo(0, 0); const heading = document.querySelector('main h1'); if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); } }, [location.pathname]);
  return <div className="app-shell"><header className="topbar"><div className="topbar-inner"><Link className="wordmark" to="/" aria-label="hotel-core home"><svg viewBox="0 0 36 36" aria-hidden="true"><rect x="2" y="2" width="32" height="32" rx="10" fill="currentColor"/><path d="M11 24V12m0 7h7m0 5V12m0 12v-5c0-3-4-3-7-2" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg><span>hotel-core</span></Link><nav className="desktop-nav" aria-label="Main navigation">{tabs.filter(([path]) => path !== '/search').map(([path,label]) => <NavLink key={path} to={path}>{label}</NavLink>)}</nav><Link className="header-cart" to="/cart" aria-label={`Cart, ${cart.items.reduce((n,x)=>n+x.qty,0)} items`}><ShoppingBag/>{cart.items.length > 0 && <b>{cart.items.reduce((n,x)=>n+x.qty,0)}</b>}</Link></div></header><main id="main-content"><Outlet/></main><nav className="bottom-tabs" aria-label="Primary">{tabs.map(([path,label,Icon]) => <NavLink key={path} to={path} end={path === '/'}><Icon size={21}/><span>{label}</span></NavLink>)}</nav><Toast message={offline ? "You're offline. We'll reconnect when your connection returns." : ''} persistent onClose={() => setOffline(false)}/>{token && <span className="sr-only" aria-live="polite">Signed in</span>}</div>;
}
