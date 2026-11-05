import React from 'react';
import { createBrowserRouter, Link, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import Shell from './components/Shell.jsx';
import NotFound from './pages/NotFound.jsx';
import { useSession } from './store/session.js';
import { useMe } from './api/hooks.js';
const Home=React.lazy(()=>import('./pages/Home.jsx'));
const Hotel=React.lazy(()=>import('./pages/Hotel.jsx'));
const Cart=React.lazy(()=>import('./pages/Cart.jsx'));
const Orders=React.lazy(()=>import('./pages/Orders.jsx'));
const OrderDetail=React.lazy(()=>import('./pages/OrderDetail.jsx'));
const Account=React.lazy(()=>import('./pages/Account.jsx'));
const Auth=React.lazy(()=>import('./pages/Auth.jsx'));
const Partner=React.lazy(()=>import('./pages/Partner.jsx'));
const OrderPlaced=React.lazy(()=>import('./pages/OrderPlaced.jsx'));
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
 {index:true,element:<SuspensePage><Title title="Discover"><Home/></Title></SuspensePage>},{path:'search',element:<SuspensePage><Title title="Search"><Home/></Title></SuspensePage>},{path:'hotel/:id',element:<SuspensePage><Title title="Menu"><Hotel/></Title></SuspensePage>},{path:'cart',element:<SuspensePage><Title title="Your cart"><Cart/></Title></SuspensePage>},{path:'order-placed',element:<SuspensePage><Title title="Order confirmed"><OrderPlaced/></Title></SuspensePage>},{path:'orders',element:<SuspensePage><Protected><Title title="Your orders"><Orders/></Title></Protected></SuspensePage>},{path:'orders/:id',element:<SuspensePage><Protected><Title title="Order details"><OrderDetail/></Title></Protected></SuspensePage>},{path:'account',element:<SuspensePage><Protected><Title title="Account"><Account/></Title></Protected></SuspensePage>},{path:'login',element:<SuspensePage><Title title="Log in"><Auth/></Title></SuspensePage>},{path:'partner',element:<SuspensePage><Title title="Partner with us"><Partner/></Title></SuspensePage>},
 {path:'admin/:hotelId',element:<AdminGuard/>,children:[{element:<HotelGuard/>,children:[{element:<SuspensePage><AdminShell/></SuspensePage>,children:[{index:true,element:<Navigate to="orders" replace/>},{path:'orders',element:<SuspensePage><AdminOrders/></SuspensePage>},{path:'menu',element:<SuspensePage><AdminMenu/></SuspensePage>},{path:'reports',element:<SuspensePage><AdminReports/></SuspensePage>},{path:'settings',element:<SuspensePage><AdminSettings/></SuspensePage>}]}]}]},
 {path:'platform',element:<PlatformGuard/>,children:[{element:<SuspensePage><AdminShell/></SuspensePage>,children:[{index:true,element:<Navigate to="hotels" replace/>},{path:'hotels',element:<SuspensePage><PlatformHotels/></SuspensePage>},{path:'hotels/:hotelId',element:<SuspensePage><PlatformHotelDetail/></SuspensePage>},{path:'metrics',element:<SuspensePage><PlatformMetrics/></SuspensePage>}]}]},
 {path:'*',element:<NotFound/>}
]}]);
