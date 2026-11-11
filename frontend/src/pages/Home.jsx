import React from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useHotels, useMe } from '../api/hooks.js';
import HotelCard from '../components/HotelCard.jsx';
import { ErrorState, Skeleton } from '../components/ui/index.jsx';

function cuisinesFrom(hotels) {
  return [...new Set(hotels.flatMap((hotel) => String(hotel.cuisines || '')
    .split(',')
    .map((cuisine) => cuisine.trim())
    .filter(Boolean)))].sort();
}

export default function Home() {
  const profile = useMe();
  const [input, setInput] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [cuisine, setCuisine] = React.useState('');
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const id = setTimeout(() => {
      setSearch(input.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [input]);

  const query = useHotels({ search, page, limit: 20 });
  const payload = query.data;
  const hotels = React.useMemo(() => {
    if (payload?.items) return payload.items;
    if (payload?.data) return Array.isArray(payload.data) ? payload.data : [];
    if (Array.isArray(payload)) return payload;
    return [];
  }, [payload]);
  const listed = cuisine
    ? hotels.filter((hotel) => String(hotel.cuisines || '').split(',').map((item) => item.trim()).includes(cuisine))
    : hotels;
  const chips = cuisinesFrom(hotels);
  const total = payload?.meta?.total ?? payload?.total ?? hotels.length;
  const pages = payload?.meta?.totalPages ?? payload?.totalPages ?? 1;
  const showLoading = query.isPending && !payload;
  const showEmpty = query.isSuccess && listed.length === 0;
  const adminHotels = profile.data?.role !== 'PLATFORM_ADMIN' ? profile.data?.admin_of || [] : [];

  return <section className="page home-page">
    <div className="hero-copy">
      <p className="eyebrow">GOOD FOOD, CLOSE BY</p>
      <h1>Find your next<br/><span>favourite meal.</span></h1>
      <p>Discover neighbourhood kitchens and the dishes they do best.</p>
      <Link className="button button-secondary home-register-hotel" to="/partner">Register a hotel</Link>
    </div>
    {adminHotels.length > 0 && <nav className="home-admin-actions" aria-label="Hotel order management">
      {adminHotels.map((hotel) => <Link
        key={hotel.hotel_id}
        className="button button-secondary"
        to={`/admin/${hotel.hotel_id}/orders`}
      >Manage orders · {hotel.name || hotel.hotel_name || `Hotel ${hotel.hotel_id}`}</Link>)}
    </nav>}
    <label className="search-box">
      <Search size={19}/>
      <input aria-label="Search hotels or cuisines" placeholder="Search hotels or cuisines" value={input} onChange={(event) => setInput(event.target.value)}/>
      {input && <button aria-label="Clear search" onClick={() => setInput('')}><X size={16}/></button>}
    </label>
    {chips.length > 0 && <div className="chip-row" aria-label="Filter by cuisine">
      <button className={`chip ${!cuisine ? 'selected' : ''}`} onClick={() => setCuisine('')}>All cuisines</button>
      {chips.map((item) => <button key={item} className={`chip ${cuisine === item ? 'selected' : ''}`} aria-pressed={cuisine === item} onClick={() => setCuisine(cuisine === item ? '' : item)}>{item}</button>)}
    </div>}
    <div className="section-heading">
      <div><p className="eyebrow">CURATED FOR YOU</p><h2>Hotels for you</h2></div>
      <span className="result-count">{query.isSuccess ? `${total} places` : ''}</span>
    </div>
    {showLoading ? <Skeleton count={6}/> : query.isError ? <ErrorState error={query.error} retry={query.refetch}/> : listed.length ? <>
      <div className="hotel-grid">{listed.map((hotel) => <HotelCard key={hotel.id} hotel={hotel}/>)}</div>
      {query.isFetching && page > 1 && <p className="muted" role="status">Loading more hotels…</p>}
      {page < pages && <button className="button button-secondary load-more" onClick={() => setPage(page + 1)} disabled={query.isFetching}>Load more</button>}
    </> : showEmpty ? <div className="state-panel">
      <strong>{search || cuisine ? 'No matching hotels' : 'No hotels yet'}</strong>
      <span>Try another search or clear your filters.</span>
      {(search || cuisine) && <button className="button button-secondary" onClick={() => { setInput(''); setCuisine(''); }}>Clear filters</button>}
    </div> : null}
  </section>;
}
