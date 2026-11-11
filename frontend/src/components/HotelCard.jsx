import React from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { MapPin, CircleCheck, CircleX } from 'lucide-react';
import { prefetchHotel } from '../api/hooks.js';
import { SafeImage } from '../lib/images.jsx';

export default function HotelCard({ hotel }) {
  const queryClient = useQueryClient();
  const prefetch = () => prefetchHotel(queryClient, hotel.id);
  const acceptingOrders = hotel.accepting_orders === true;

  return <Link
    to={`/hotel/${hotel.id}`}
    className={`hotel-card ${acceptingOrders ? '' : 'hotel-closed'}`}
    onMouseEnter={prefetch}
    onFocus={prefetch}
    onTouchStart={prefetch}
  >
    <div className="hotel-cover">
      <SafeImage src={hotel.cover_url} alt={`${hotel.name} cover`} kind="hotel" width={640} height={360}/>
      <span className="hotel-logo"><SafeImage src={hotel.logo_url} alt="" kind="logo" width={48} height={48}/></span>
      {!acceptingOrders && <span className="closed-overlay">Not accepting orders</span>}
    </div>
    <div className="hotel-card-copy">
      <h2>{hotel.name}</h2>
      <p className="cuisine-line">{hotel.cuisines || 'Local favourites'}</p>
      <p className="address-line"><MapPin size={14}/>{hotel.address || 'Nearby'}</p>
      <span className={`hotel-order-status ${acceptingOrders ? 'is-open' : 'is-closed'}`}>
        {acceptingOrders ? <CircleCheck size={15}/> : <CircleX size={15}/>}
        {acceptingOrders ? 'Accepting orders' : 'Temporarily closed'}
      </span>
    </div>
  </Link>;
}
