import React from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { MapPin, Clock3 } from 'lucide-react';
import { prefetchHotel } from '../api/hooks.js';
import { SafeImage } from '../lib/images.jsx';
export default function HotelCard({ hotel }) { const qc = useQueryClient(); const prefetch = () => prefetchHotel(qc, hotel.id); return <Link to={`/hotel/${hotel.id}`} className={`hotel-card ${hotel.accepting_orders ? '' : 'hotel-closed'}`} onMouseEnter={prefetch} onFocus={prefetch} onTouchStart={prefetch}><div className="hotel-cover"><SafeImage src={hotel.cover_url} alt={`${hotel.name} cover`} kind="hotel" width={640} height={360}/><span className="hotel-logo"><SafeImage src={hotel.logo_url} alt="" kind="logo" width={48} height={48}/></span>{!hotel.accepting_orders && <span className="closed-overlay">Closed</span>}</div><div className="hotel-card-copy"><h2>{hotel.name}</h2><p className="cuisine-line">{hotel.cuisines || 'Local favourites'}</p><p className="address-line"><MapPin size={14}/>{hotel.address || 'Nearby'}</p></div><span className="delivery-hint"><Clock3 size={14}/> Popular nearby</span></Link>; }
