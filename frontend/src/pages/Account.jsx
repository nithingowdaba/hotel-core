import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, UserRound } from 'lucide-react';
import { useMe } from '../api/hooks.js';
import { useSession } from '../store/session.js';
import { ErrorState, Skeleton } from '../components/ui/index.jsx';
export default function Account(){const q=useMe(),clear=useSession(s=>s.clearSession),nav=useNavigate();if(q.isPending)return <section className="page"><Skeleton count={2}/></section>;if(q.isError)return <section className="page"><ErrorState error={q.error} retry={q.refetch}/></section>;const u=q.data;return <section className="page account-page"><p className="eyebrow">YOUR PROFILE</p><h1>Account</h1><div className="profile-card"><div className="avatar"><UserRound/></div><h2>{u.full_name}</h2><p>{u.email}</p><p>{u.phone}</p></div>{(u.admin_of||[]).length>0&&<section className="account-links"><h2>Hotel tools</h2>{u.admin_of.map(h=><Link key={h.hotel_id} to={`/admin/${h.hotel_id}`} className="account-link">Manage {h.hotel_name}<span>→</span></Link>)}</section>}{u.role==='PLATFORM_ADMIN'&&<section className="account-links"><h2>Platform</h2><Link className="account-link" to="/platform">Platform console <span>→</span></Link></section>}<button className="button button-secondary logout-button" onClick={()=>{clear();nav('/',{replace:true});}}><LogOut size={18}/>Log out</button></section>;}
