import React from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
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
const ComingSoon=React.lazy(()=>import('./pages/ComingSoon.jsx'));
function Protected({children}){const token=useSession(s=>s.token),loc=useLocation();return token?children:<Navigate to={`/login?next=${encodeURIComponent(loc.pathname+loc.search)}`} replace/>;}
class Boundary extends React.Component{constructor(p){super(p);this.state={failed:false};}static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<main className="page state-panel"><h1>Something went wrong</h1><button className="button button-primary" onClick={()=>this.setState({failed:false})}>Try again</button></main>:this.props.children;}}
function Title({children,title}){React.useEffect(()=>{document.title=`${title} · hotel-core`;},[title]);return children;}
export const router=createBrowserRouter([{path:'/',element:<Shell/>,errorElement:<Boundary><NotFound/></Boundary>,children:[{index:true,element:<Title title="Discover"><Home/></Title>},{path:'search',element:<Title title="Search"><Home/></Title>},{path:'hotel/:id',element:<Title title="Menu"><Hotel/></Title>},{path:'cart',element:<Title title="Your cart"><Cart/></Title>},{path:'order-placed',element:<Title title="Order confirmed"><OrderPlaced/></Title>},{path:'orders',element:<Protected><Title title="Your orders"><Orders/></Title></Protected>},{path:'orders/:id',element:<Protected><Title title="Order details"><OrderDetail/></Title></Protected>},{path:'account',element:<Protected><Title title="Account"><Account/></Title></Protected>},{path:'login',element:<Title title="Log in"><Auth/></Title>},{path:'admin/*',element:<React.Suspense fallback={<div className="page loading-lines"/>}><ComingSoon/></React.Suspense>},{path:'platform/*',element:<React.Suspense fallback={<div className="page loading-lines"/>}><ComingSoon/></React.Suspense>},{path:'*',element:<NotFound/>}]}]);
