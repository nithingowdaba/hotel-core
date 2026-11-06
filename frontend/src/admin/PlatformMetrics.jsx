import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/index.jsx';
import { AdminEmpty, AdminError, AdminLoading, DataTable, PageHeading, Toggle } from './components.jsx';
import { adminApi, adminKeys, displayError } from './api.js';

const countLabel = (value) => Number(value || 0).toLocaleString('en-IN');
const duration = (value) => `${Number(value || 0).toFixed(1)} ms`;
const uptimeLabel = (seconds) => {
  const total = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(total / 86400), hours = Math.floor((total % 86400) / 3600), minutes = Math.floor((total % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
};

export default function PlatformMetrics() {
  const [auto, setAuto] = React.useState(false);
  const query = useQuery({ queryKey: adminKeys.metrics, queryFn: adminApi.metrics, staleTime: 10000, refetchInterval: auto ? 30000 : false, refetchIntervalInBackground: false, retry: (n, e) => e.status >= 400 && e.status < 500 ? false : n < 1 });
  const metrics = query.data || {};
  const routes = [...(metrics.routes || [])].sort((a, b) => Number(b.count) - Number(a.count));
  const requests = routes.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const columns = [
    { key: 'route', label: 'Route' }, { key: 'count', label: 'Requests', render: (row) => countLabel(row.count) },
    { key: 'errors', label: 'Errors', render: (row) => countLabel(row.errors) }, { key: 'p50_ms', label: 'p50', render: (row) => duration(row.p50_ms) },
    { key: 'p95_ms', label: 'p95', render: (row) => duration(row.p95_ms) }, { key: 'max_ms', label: 'Max', render: (row) => duration(row.max_ms) },
  ];
  if (query.isPending) return <section className="admin-page"><AdminLoading rows={5}/></section>;
  if (query.isError) return <section className="admin-page"><PageHeading eyebrow="PLATFORM CONSOLE" title="Metrics"/><AdminError error={{ ...query.error, message: displayError(query.error) }} retry={query.refetch}/></section>;
  return <section className="admin-page"><PageHeading eyebrow="PLATFORM CONSOLE" title="Metrics" actions={<><Toggle label="Auto-refresh" description="Refresh every 30 seconds" checked={auto} onChange={setAuto}/><Button variant="secondary" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw size={16}/> Refresh</Button></>}/>
    <div className="admin-summary-grid"><div className="admin-summary-card"><span>Total hotels</span><strong>{countLabel(metrics.total_hotels)}</strong></div><div className="admin-summary-card"><span>Active hotels</span><strong>{countLabel(metrics.active_hotels)}</strong></div><div className="admin-summary-card"><span>Suspended hotels</span><strong>{countLabel(metrics.suspended_hotels)}</strong></div><div className="admin-summary-card"><span>Legacy pending · admin activation only</span><strong>{countLabel(metrics.legacy_pending_hotels)}</strong></div><div className="admin-summary-card"><span>Legacy rejected · admin activation only</span><strong>{countLabel(metrics.legacy_rejected_hotels)}</strong></div><div className="admin-summary-card"><span>Process uptime</span><strong>{uptimeLabel(metrics.uptime_seconds)}</strong></div><div className="admin-summary-card"><span>Total requests recorded</span><strong>{countLabel(requests)}</strong></div><div className="admin-summary-card"><span>Routes observed</span><strong>{countLabel(routes.length)}</strong></div></div>
    {!routes.length ? <AdminEmpty title="No request metrics yet" detail="Route metrics will appear as the platform receives traffic."/> : <DataTable columns={columns} rows={routes} rowKey={(row) => row.route} rowClassName={(row) => Number(row.errors) > 0 ? 'metrics-error-row' : Number(row.p95_ms) > 500 ? 'metrics-slow-row' : ''} renderMobile={(row) => <div className={`metrics-mobile ${Number(row.errors) > 0 ? 'metrics-error-row' : Number(row.p95_ms) > 500 ? 'metrics-slow-row' : ''}`}><strong>{row.route}</strong><div className="admin-mobile-field"><span>Requests / errors</span><strong>{countLabel(row.count)} / {countLabel(row.errors)}</strong></div><div className="admin-mobile-field"><span>Latency p50 / p95 / max</span><strong>{duration(row.p50_ms)} · {duration(row.p95_ms)} · {duration(row.max_ms)}</strong></div></div>}/>}
  </section>;
}
