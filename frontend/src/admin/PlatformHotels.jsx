import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { formatDate } from '../lib/format.js';
import { Button, StatusChip } from '../components/ui/index.jsx';
import { AdminEmpty, AdminError, AdminLoading, ConfirmDialog, DataTable, Field, LoadMore, PageHeading, Sheet, useNotice } from './components.jsx';
import { adminApi, adminKeys, displayError, fieldErrors } from './api.js';

const unpack = (data) => data?.items || data?.data || (Array.isArray(data) ? data : []);
const blank = { name: '', slug: '', cuisines: '', address: '', phone: '', description: '' };

export default function PlatformHotels() {
  const nav = useNavigate();
  const client = useQueryClient();
  const notify = useNotice();
  const [page, setPage] = React.useState(1);
  const [queryText, setQueryText] = React.useState('');
  const [rows, setRows] = React.useState([]);
  const [creating, setCreating] = React.useState(false);
  const [suspending, setSuspending] = React.useState(null);
  const [form, setForm] = React.useState(blank);
  const [errors, setErrors] = React.useState({});
  const [formError, setFormError] = React.useState('');
  const params = { page, limit: 20, ...(queryText.trim() ? { search: queryText.trim() } : {}) };
  const query = useQuery({ queryKey: adminKeys.hotels(params), queryFn: () => adminApi.hotels(params), staleTime: 30000, retry: (n, e) => e.status >= 400 && e.status < 500 ? false : n < 1 });
  React.useEffect(() => { if (!query.data) return; const pageRows = unpack(query.data); setRows((old) => page === 1 ? pageRows : [...old, ...pageRows]); }, [query.data, page]);
  const total = Number(query.data?.meta?.total ?? rows.length);
  const create = useMutation({
    mutationFn: adminApi.createHotel,
    onSuccess: () => { setCreating(false); setForm(blank); setErrors({}); client.invalidateQueries({ queryKey: ['platform', 'hotels'] }); notify('Hotel created.'); },
    onError: (error) => { setErrors(fieldErrors(error)); setFormError(error.code === 'SLUG_IN_USE' ? displayError(error) : ''); if (error.code !== 'SLUG_IN_USE' && !Object.keys(fieldErrors(error)).length) setFormError(displayError(error)); },
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }) => adminApi.updatePlatformHotel(id, { status }),
    onSuccess: () => { setSuspending(null); client.invalidateQueries({ queryKey: ['platform', 'hotels'] }); notify('Hotel status updated.'); },
    onError: (error) => { setSuspending(null); notify(displayError(error), 'error'); },
  });
  const change = (key, value) => { setForm((old) => ({ ...old, [key]: value })); setErrors((old) => ({ ...old, [key]: undefined })); setFormError(''); };
  const submitCreate = (event) => {
    event.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = 'Hotel name is required.';
    if (form.slug && !/^[a-z0-9-]{1,80}$/.test(form.slug)) next.slug = 'Use lowercase letters, numbers and hyphens only.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
    create.mutate(body);
  };
  const columns = [
    { key: 'name', label: 'Hotel', render: (hotel) => <strong>{hotel.name}</strong> },
    { key: 'slug', label: 'Slug' },
    { key: 'status', label: 'Status', render: (hotel) => <StatusChip status={hotel.status}/> },
    { key: 'admin_count', label: 'Admins', render: (hotel) => Number(hotel.admin_count || 0).toLocaleString('en-IN') },
    { key: 'created_at', label: 'Created', render: (hotel) => hotel.created_at ? formatDate(hotel.created_at) : '—' },
    { key: 'accepting_orders', label: 'Orders', render: (hotel) => hotel.accepting_orders ? 'Open' : 'Closed' },
    { key: 'actions', label: 'Actions', render: (hotel) => <div className="admin-row-actions" onClick={(event) => event.stopPropagation()}><button type="button" className="button button-secondary" onClick={() => nav(`/platform/hotels/${hotel.id}`)}>Manage</button><button type="button" className={`button ${hotel.status === 'suspended' ? 'button-primary' : 'button-danger'}`} onClick={() => setSuspending(hotel)}>{hotel.status === 'suspended' ? 'Activate' : 'Suspend'}</button></div> },
  ];
  if (query.isPending && !rows.length && page === 1 && !queryText) return <section className="admin-page"><AdminLoading rows={4}/></section>;
  if (query.isError && !rows.length) return <section className="admin-page"><PageHeading eyebrow="PLATFORM" title="Hotels"/><AdminError error={{ ...query.error, message: displayError(query.error) }} retry={query.refetch}/></section>;
  return <section className="admin-page"><PageHeading eyebrow="PLATFORM CONSOLE" title="Hotels" actions={<Button onClick={() => { setCreating(true); setForm(blank); setErrors({}); setFormError(''); }}><Plus size={17}/> Create hotel</Button>}/>
    <div className="admin-toolbar"><label className="search-box"><Search size={17}/><input aria-label="Search hotels" placeholder="Search name or slug" value={queryText} onChange={(event) => { setQueryText(event.target.value); setPage(1); setRows([]); }}/></label><span className="admin-last-updated">{total} hotels</span></div>
    {!rows.length && !query.isPending ? <AdminEmpty title={queryText ? 'No matching hotels' : 'No hotels yet'} detail={queryText ? 'Try another search term.' : 'Create a hotel to start managing the platform.'}/> : <DataTable columns={columns} rows={rows} rowKey={(hotel) => hotel.id} onRowClick={(hotel) => nav(`/platform/hotels/${hotel.id}`)} renderMobile={(hotel) => <><div className="admin-mobile-field"><span>Hotel</span><strong>{hotel.name}</strong></div><div className="admin-mobile-field"><span>Slug</span><strong>{hotel.slug}</strong></div><div className="admin-mobile-field"><span>Status</span><strong><StatusChip status={hotel.status}/></strong></div><div className="admin-mobile-field"><span>Admins</span><strong>{Number(hotel.admin_count || 0)}</strong></div><div className="admin-mobile-field"><span>Orders</span><strong>{hotel.accepting_orders ? 'Open' : 'Closed'}</strong></div><div className="admin-mobile-actions"><button type="button" className="button button-secondary" onClick={() => nav(`/platform/hotels/${hotel.id}`)}>Manage</button><button type="button" className={`button ${hotel.status === 'suspended' ? 'button-primary' : 'button-danger'}`} onClick={() => setSuspending(hotel)}>{hotel.status === 'suspended' ? 'Activate' : 'Suspend'}</button></div></>}/>}
    <LoadMore hasMore={(query.data?.meta?.totalPages || 1) > page} loading={query.isFetching} onClick={() => setPage((value) => value + 1)}/>
    {creating && <Sheet title="Create hotel" onClose={() => !create.isPending && setCreating(false)}><form onSubmit={submitCreate} noValidate>{formError && <p className="admin-inline-error" role="alert">{formError}</p>}<div className="admin-form-grid"><Field className="field-span" label="Hotel name" name="name" required value={form.name} onChange={(event) => change('name', event.target.value)} maxLength={120} error={errors.name}/><Field className="field-span" label="Slug (optional)" name="slug" value={form.slug} onChange={(event) => change('slug', event.target.value)} maxLength={80} error={errors.slug}/><Field label="Cuisines" name="cuisines" value={form.cuisines} onChange={(event) => change('cuisines', event.target.value)} maxLength={160}/><Field label="Phone" name="phone" value={form.phone} onChange={(event) => change('phone', event.target.value)} maxLength={20}/><Field className="field-span" as="textarea" label="Address" name="address" value={form.address} onChange={(event) => change('address', event.target.value)} maxLength={255}/><Field className="field-span" as="textarea" label="Description" name="description" value={form.description} onChange={(event) => change('description', event.target.value)} maxLength={10000}/></div><div className="admin-form-actions"><button type="button" className="button button-secondary" disabled={create.isPending} onClick={() => setCreating(false)}>Cancel</button><button className="button button-primary" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create hotel'}</button></div></form></Sheet>}
    {suspending && <ConfirmDialog title={suspending.status === 'suspended' ? 'Activate this hotel?' : 'Suspend this hotel?'} danger={suspending.status !== 'suspended'} confirmLabel={suspending.status === 'suspended' ? 'Activate hotel' : 'Suspend hotel'} pending={setStatus.isPending} onClose={() => setSuspending(null)} onConfirm={() => setStatus.mutate({ id: suspending.id, status: suspending.status === 'suspended' ? 'active' : 'suspended' })}><p>{suspending.status === 'suspended' ? 'Customers and hotel administrators will be able to use this hotel again.' : 'Customers will no longer be able to browse or order from this hotel.'}</p></ConfirmDialog>}
  </section>;
}
