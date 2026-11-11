import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, UserRound } from 'lucide-react';
import { useMe, useMyHotels } from '../api/hooks.js';
import { StatusChip } from '../components/ui/index.jsx';
import { useSession } from '../store/session.js';
import { ErrorState, Skeleton } from '../components/ui/index.jsx';
import Orders from './Orders.jsx';

export default function Account() {
  const q = useMe();
  const hotelsQ = useMyHotels();
  const clear = useSession((state) => state.clearSession);
  const nav = useNavigate();

  if (q.isPending) return <section className="page"><Skeleton count={2}/></section>;
  if (q.isError) return <section className="page"><ErrorState error={q.error} retry={q.refetch}/></section>;

  const user = q.data;
  const memberships = hotelsQ.data || user.admin_of || [];

  return <section className="page account-page">
    <Link className="button button-secondary account-back" to="/"><ArrowLeft size={18}/>Back to home</Link>
    <p className="eyebrow">YOUR PROFILE</p>
    <h1>Account</h1>
    <div className="profile-card">
      <div className="avatar"><UserRound/></div>
      <h2>{user.full_name}</h2>
      <p>{user.email}</p>
      <p>{user.phone}</p>
    </div>
    <Orders embedded/>
    <section className="account-links">
      <h2>My hotels</h2>
      {hotelsQ.isError && <ErrorState error={hotelsQ.error} retry={hotelsQ.refetch}/>}
      {memberships.length > 0
        ? memberships.map((hotel) => <Link key={hotel.hotel_id} to={`/admin/${hotel.hotel_id}`} className="account-link">Manage {hotel.name}<StatusChip status={hotel.status || 'active'}/><span>→</span></Link>)
        : !hotelsQ.isPending && !hotelsQ.isError && <p>You do not manage any hotels yet.</p>}
      <Link className="account-link" to="/partner">Partner with us <span>→</span></Link>
    </section>
    {user.role === 'PLATFORM_ADMIN' && <section className="account-links"><h2>Platform</h2><Link className="account-link" to="/platform">Platform console <span>→</span></Link></section>}
    <button className="button button-secondary logout-button" onClick={() => { clear(); nav('/', { replace: true }); }}><LogOut size={18}/>Log out</button>
  </section>;
}
