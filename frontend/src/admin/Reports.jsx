import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { formatMoney } from '../lib/format.js';
import { AdminEmpty, AdminError, AdminLoading, PageHeading, Tabs } from './components.jsx';
import { adminApi, adminKeys, displayError } from './api.js';

const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shiftDate = (date, days) => { const [year, month, day] = date.split('-').map(Number); const value = new Date(Date.UTC(year, month - 1, day + days)); return value.toISOString().slice(0, 10); };
const rowsOf = (value) => value?.items || value?.data || (Array.isArray(value) ? value : []);

export default function AdminReports() {
  const { hotelId } = useOutletContext();
  const [date, setDate] = React.useState(todayIST);
  const [range, setRange] = React.useState('7');
  const [from, setFrom] = React.useState(() => shiftDate(todayIST(), -6));
  const [to, setTo] = React.useState(todayIST);
  const daily = useQuery({ queryKey: adminKeys.daily(hotelId, date), queryFn: () => adminApi.dailySales(hotelId, date), staleTime: 30000, retry: (n, e) => e.status >= 400 && e.status < 500 ? false : n < 1 });
  const topFrom = range === 'custom' ? from : shiftDate(to, -(Number(range) - 1));
  const top = useQuery({ queryKey: adminKeys.top(hotelId, { from: topFrom, to, limit: 10 }), queryFn: () => adminApi.topItems(hotelId, { from: topFrom, to, limit: 10 }), enabled: Boolean(topFrom && to), staleTime: 30000, retry: (n, e) => e.status >= 400 && e.status < 500 ? false : n < 1 });
  const topRows = rowsOf(top.data);
  const maximum = Math.max(1, ...topRows.map((row) => Number(row.quantity_sold) || 0));
  return <section className="admin-page">
    <PageHeading eyebrow="HOTEL WORKSPACE" title="Reports"/>
    <div className="admin-form-section"><div className="admin-section-heading"><div><h2>Daily sales</h2><p>Completed orders on an Asia/Kolkata calendar day.</p></div><label className="admin-date-label">Sales date <input type="date" value={date} onChange={(event) => setDate(event.target.value)}/></label></div>
      {daily.isPending ? <AdminLoading rows={1}/> : daily.isError ? <AdminError error={{ ...daily.error, message: displayError(daily.error) }} retry={daily.refetch}/> : <div className="admin-summary-grid admin-daily-summary"><Summary label="Completed orders" value={Number(daily.data?.completed_order_count || 0).toLocaleString('en-IN')}/><Summary label="Total sales" value={formatMoney(daily.data?.total_sales || 0)}/></div>}
    </div>
    <div className="admin-form-section"><div className="admin-section-heading"><div><h2>Top-selling items</h2><p>Completed, non-cancelled orders within the selected range.</p></div></div>
      <Tabs label="Report date range" value={range} onChange={(value) => { setRange(value); if (value !== 'custom') { setTo(todayIST()); setFrom(shiftDate(todayIST(), -(Number(value) - 1))); } }} items={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: 'custom', label: 'Custom range' }]}/>
      {range === 'custom' && <div className="admin-toolbar"><label>From <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)}/></label><label>To <input type="date" value={to} min={from} max={todayIST()} onChange={(event) => setTo(event.target.value)}/></label></div>}
      {top.isPending ? <AdminLoading rows={3}/> : top.isError ? <AdminError error={{ ...top.error, message: displayError(top.error) }} retry={top.refetch}/> : !topRows.length ? <AdminEmpty title="No completed sales in this range" detail="Top-selling dishes will appear after orders are completed."/> : <div className="admin-report-list">{topRows.map((item, index) => { const percent = Math.max(10, Math.ceil((Number(item.quantity_sold) / maximum) * 10) * 10); return <article className="admin-report-row" key={`${item.menu_item_id}-${item.item_name}`}><strong><span className="admin-rank">{index + 1}</span>{item.item_name}</strong><span>{Number(item.quantity_sold).toLocaleString('en-IN')} sold</span><div className="admin-bar" role="img" aria-label={`${item.item_name}: ${item.quantity_sold} sold`}><i className={`admin-bar-fill admin-bar-${percent}`}/></div></article>; })}</div>}
    </div>
  </section>;
}

function Summary({ label, value }) { return <div className="admin-summary-card"><span>{label}</span><strong>{value}</strong></div>; }
