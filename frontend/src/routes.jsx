import React from 'react';
import { createBrowserRouter, Link, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import Shell from './components/Shell.jsx';
import Home from './pages/Home.jsx';
import Hotel from './pages/Hotel.jsx';
import Cart from './pages/Cart.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Account from './pages/Account.jsx';
import Auth from './pages/Auth.jsx';
import OrderPlaced from './pages/OrderPlaced.jsx';
import NotFound from './pages/NotFound.jsx';
import { useSession } from './store/session.js';
import { useMe } from './api/hooks.js';
const AdminShell=React.lazy(()=>import('./admin/AdminShell.jsx'));
const AdminOrders=React.lazy(()=>import('./admin/Orders.jsx'));
const AdminMenu=React.lazy(()=>import('./admin/Menu.jsx'));
const AdminReports=React.lazy(()=>import('./admin/Reports.jsx'));
const AdminSettings=React.lazy(()=>import('./admin/Settings.jsx'));
const PlatformHotels=React.lazy(()=>import('./admin/PlatformHotels.jsx'));
const PlatformHotelDetail=React.lazy(()=>import('./admin/PlatformHotelDetail.jsx'));
const PlatformMetrics=React.lazy(()=>import('./admin/PlatformMetrics.jsx'));
function Protected({children}){const token=useSession(s=>s.token),loc=useLocation();return token?children:<Navigate to={`/login?next=${encodeURIComponent(loc.pathname+loc.search)}`} replace/>;}
function AccessMessage({title='Not authorized'}){return <main className="page state-panel admin-no-access"><h1>{title}</h1><p>Your account does not have permission to view this page.</p><Link className="button button-primary" to="/">Back to home</Link></main>;}
export function AdminGuard(){const token=useSession(s=>s.token),loc=useLocation(),profile=useMe();if(!token)return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname+loc.search)}`} replace/>;if(profile.isPending)return <div className="page loading-lines" aria-label="Loading"><div/><div/></div>;return profile.isError?<AccessMessage/>:<Outlet/>;}
export function HotelGuard(){const {hotelId}=useParams(),profile=useMe();if(profile.isPending)return <div className="page loading-lines" aria-label="Loading"><div/><div/></div>;if(profile.isError)return <AccessMessage/>;const data=profile.data;const allowed=data?.role==='PLATFORM_ADMIN'||(data?.admin_of||[]).some(h=>String(h.hotel_id)===String(hotelId));return allowed?<Outlet/>:<AccessMessage/>;}
export function PlatformGuard(){const token=useSession(s=>s.token),loc=useLocation(),profile=useMe();if(!token)return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname+loc.search)}`} replace/>;if(profile.isPending)return <div className="page loading-lines" aria-label="Loading"><div/><div/></div>;return profile.isError||profile.data?.role!=='PLATFORM_ADMIN'?<AccessMessage/>:<Outlet/>;}
class Boundary extends React.Component{constructor(p){super(p);this.state={failed:false};}static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<main className="page state-panel"><h1>Something went wrong</h1><button className="button button-primary" onClick={()=>this.setState({failed:false})}>Try again</button></main>:this.props.children;}}
function Title({children,title}){React.useEffect(()=>{document.title=`${title} · hotel-core`;},[title]);return children;}
const SuspensePage=({children})=><React.Suspense fallback={<div className="page loading-lines" aria-label="Loading"><div/><div/><div/></div>}>{children}</React.Suspense>;
export const router=createBrowserRouter([{path:'/',element:<Shell/>,errorElement:<Boundary><NotFound/></Boundary>,children:[
 {index:true,element:<Title title="Discover"><Home/></Title>},{path:'search',element:<Title title="Search"><Home/></Title>},{path:'hotel/:id',element:<Title title="Menu"><Hotel/></Title>},{path:'cart',element:<Title title="Your cart"><Cart/></Title>},{path:'order-placed',element:<Title title="Order confirmed"><OrderPlaced/></Title>},{path:'orders',element:<Protected><Title title="Your orders"><Orders/></Title></Protected>},{path:'orders/:id',element:<Protected><Title title="Order details"><OrderDetail/></Title></Protected>},{path:'account',element:<Protected><Title title="Account"><Account/></Title></Protected>},{path:'login',element:<Title title="Log in"><Auth/></Title>},
 {path:'admin/:hotelId',element:<AdminGuard/>,children:[{element:<HotelGuard/>,children:[{element:<SuspensePage><AdminShell/></SuspensePage>,children:[{index:true,element:<Navigate to="orders" replace/>},{path:'orders',element:<SuspensePage><AdminOrders/></SuspensePage>},{path:'menu',element:<SuspensePage><AdminMenu/></SuspensePage>},{path:'reports',element:<SuspensePage><AdminReports/></SuspensePage>},{path:'settings',element:<SuspensePage><AdminSettings/></SuspensePage>}]}]}]},
 {path:'platform',element:<PlatformGuard/>,children:[{element:<SuspensePage><AdminShell/></SuspensePage>,children:[{index:true,element:<Navigate to="hotels" replace/>},{path:'hotels',element:<SuspensePage><PlatformHotels/></SuspensePage>},{path:'hotels/:hotelId',element:<SuspensePage><PlatformHotelDetail/></SuspensePage>},{path:'metrics',element:<SuspensePage><PlatformMetrics/></SuspensePage>}]}]},
 {path:'*',element:<NotFound/>}
]}]);
