import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import { SafeImage } from '../lib/images.jsx';
import { Button, StatusChip } from '../components/ui/index.jsx';
import { AdminEmpty, AdminError, AdminLoading, ConfirmDialog, DataTable, Field, ImagePreview, LoadMore, PageHeading, Sheet, Tabs, useNotice } from './components.jsx';
import { adminApi, adminKeys, displayError, fieldErrors } from './api.js';

const fields = ['name', 'description', 'cuisines', 'address', 'phone', 'logo_url', 'cover_url'];
const getFields = (hotel) => Object.fromEntries(fields.map((key) => [key, hotel?.[key] || '']));
const rowsOf = (data) => data?.items || data?.data || (Array.isArray(data) ? data : []);

export default function PlatformHotelDetail() {
  const { hotelId } = useParams();
  const client = useQueryClient();
  const notify = useNotice();
  const [page, setPage] = React.useState(1);
  const [admins, setAdmins] = React.useState([]);
  const [form, setForm] = React.useState(null);
  const [errors, setErrors] = React.useState({});
  const [formError, setFormError] = React.useState('');
  const [addMode, setAddMode] = React.useState(null);
  const [adminMode, setAdminMode] = React.useState('link');
  const [adminForm, setAdminForm] = React.useState({ full_name: '', email: '', phone: '', password: '' });
  const [adminErrors, setAdminErrors] = React.useState({});
  const [adminError, setAdminError] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [removing, setRemoving] = React.useState(null);
  const [statusConfirm, setStatusConfirm] = React.useState(false);
  const hotelsQuery = useQuery({
    queryKey: ['platform', 'hotel-detail', hotelId],
    queryFn: async () => {
      const first = await adminApi.hotels({ page: 1, limit: 100 });
      let list = rowsOf(first);
      for (let next = 2; next <= (first.meta?.totalPages || 1); next += 1) list = [...list, ...rowsOf(await adminApi.hotels({ page: next, limit: 100 }))];
      return list.find((item) => String(item.id) === String(hotelId)) || null;
    },
    staleTime: 30000,
    retry: (n, e) => e.status >= 400 && e.status < 500 ? false : n < 1,
  });
  const hotel = hotelsQuery.data;
  React.useEffect(() => { if (hotel) setForm(getFields(hotel)); }, [hotel]);
  const adminParams = { page, limit: 20 };
  const adminsQuery = useQuery({ queryKey: adminKeys.hotelAdmins(hotelId, adminParams), queryFn: () => adminApi.admins(hotelId, adminParams), enabled: Boolean(hotel), staleTime: 20000, retry: (n, e) => e.status >= 400 && e.status < 500 ? false : n < 1 });
  React.useEffect(() => { if (!adminsQuery.data) return; const list = rowsOf(adminsQuery.data); setAdmins((old) => page === 1 ? list : [...old, ...list]); }, [adminsQuery.data, page]);
  const save = useMutation({
    mutationFn: (body) => adminApi.updatePlatformHotel(hotelId, body),
    onSuccess: (updated) => { setForm(getFields(updated)); setErrors({}); setFormError(''); client.invalidateQueries({ queryKey: ['platform', 'hotel-detail', hotelId] }); client.invalidateQueries({ queryKey: ['platform', 'hotels'] }); notify('Hotel profile saved.'); },
    onError: (error) => { const next = fieldErrors(error); setErrors(next); setFormError(error.code === 'SLUG_IN_USE' ? displayError(error) : Object.keys(next).length ? 'Review the highlighted fields.' : displayError(error)); },
  });
  const add = useMutation({
    mutationFn: (body) => adminApi.addAdmin(hotelId, body),
    onSuccess: () => { setAddMode(null); setAdminErrors({}); setAdminError(''); setAdminForm({ full_name: '', email: '', phone: '', password: '' }); setPage(1); client.invalidateQueries({ queryKey: ['platform', 'admins', String(hotelId)] }); notify('Administrator added.'); },
    onError: (error) => { const details = fieldErrors(error); setAdminErrors(details); setAdminError(error.code === 'ALREADY_HOTEL_ADMIN' || error.code === 'EMAIL_IN_USE' ? displayError(error) : Object.keys(details).length ? 'Review the highlighted fields.' : displayError(error)); },
  });
  const remove = useMutation({
    mutationFn: (userId) => adminApi.removeAdmin(hotelId, userId),
    onSuccess: () => { setRemoving(null); client.invalidateQueries({ queryKey: ['platform', 'admins', String(hotelId)] }); notify('Administrator link removed. The user account remains active.'); },
    onError: (error) => { setRemoving(null); notify(displayError(error), 'error'); },
  });
  const statusChange = useMutation({
    mutationFn: (status) => adminApi.updatePlatformHotel(hotelId, { status }),
    onSuccess: () => {
      setStatusConfirm(false);
      client.invalidateQueries({ queryKey: ['platform', 'hotel-detail', hotelId] });
      client.invalidateQueries({ queryKey: ['platform', 'hotels'] });
      client.invalidateQueries({ queryKey: adminKeys.metrics });
      notify('Hotel status updated.');
    },
    onError: (error) => { setStatusConfirm(false); notify(displayError(error), 'error'); },
  });
  const changeProfile = (key, value) => { setForm((old) => ({ ...old, [key]: value })); setErrors((old) => ({ ...old, [key]: undefined })); setFormError(''); };
  const submitProfile = (event) => {
    event.preventDefault();
    const next = {};
    for (const key of ['logo_url', 'cover_url']) if (form[key] && !form[key].startsWith('https:' + '//')) next[key] = 'Enter a secure HTTPS image URL.';
    setErrors(next); if (Object.keys(next).length) return;
    const body = Object.fromEntries(fields.filter((key) => form[key] !== (hotel[key] || '')).map((key) => [key, form[key].trim() || null]));
    if (!Object.keys(body).length) { notify('There are no profile changes to save.'); return; }
    save.mutate(body);
  };
  const submitAdmin = (event) => {
    event.preventDefault();
    const next = {};
    if (adminMode === 'link') { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminForm.email.trim())) next.email = 'Enter a valid email address.'; }
    else {
      if (!adminForm.full_name.trim()) next.full_name = 'Full name is required.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminForm.email)) next.email = 'Enter a valid email address.';
      if (!adminForm.phone.trim()) next.phone = 'Phone number is required.';
      if (adminForm.password.length < 8 || adminForm.password.length > 72) next.password = 'Password must be 8–72 characters.';
    }
    setAdminErrors(next); setAdminError('');
    if (Object.keys(next).length) return;
    const body = adminMode === 'link' ? { email: adminForm.email.trim() } : { full_name: adminForm.full_name.trim(), email: adminForm.email.trim(), phone: adminForm.phone.trim(), password: adminForm.password };
    add.mutate(body);
  };
  if (hotelsQuery.isPending) return <section className="admin-page"><AdminLoading rows={4}/></section>;
  if (hotelsQuery.isError || !hotel) return <section className="admin-page"><PageHeading eyebrow="PLATFORM CONSOLE" title="Hotel details"/><AdminError error={{ ...hotelsQuery.error, message: hotel ? displayError(hotelsQuery.error) : 'Hotel not found.' }} retry={hotelsQuery.refetch}/></section>;
  const adminColumns = [{ key: 'full_name', label: 'Administrator', render: (user) => <strong>{user.full_name}</strong> }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'actions', label: 'Actions', render: (user) => <button type="button" className="button button-danger" onClick={() => setRemoving(user)}>Remove</button> }];
  return <section className="admin-page">
    <Link className="admin-back-link" to="/platform/hotels">← All hotels</Link><div className="admin-detail-heading"><div><p className="eyebrow">PLATFORM CONSOLE</p><h1>{hotel.name}</h1><p className="muted">Slug: {hotel.slug} · <StatusChip status={hotel.status}/></p></div><div className="admin-heading-actions">{hotel.status === 'active' || hotel.status === 'suspended' ? <Button variant={hotel.status === 'active' ? 'danger' : 'primary'} onClick={() => setStatusConfirm(true)}>{hotel.status === 'active' ? 'Suspend hotel' : 'Reactivate hotel'}</Button> : <Button onClick={() => setStatusConfirm(true)}>Activate legacy hotel</Button>}<SafeImage className="admin-hotel-logo" src={hotel.logo_url || hotel.cover_url} alt={`${hotel.name} image`} kind="logo" width={56} height={56}/></div></div>
    <form className="admin-form-section" onSubmit={submitProfile} noValidate><h2>Hotel profile</h2><div className="admin-form-grid"><Field className="field-span" label="Name" name="name" value={form?.name || ''} onChange={(event) => changeProfile('name', event.target.value)} maxLength={120} error={errors.name}/><Field label="Slug (read only)" name="slug" value={hotel.slug} readOnly/><Field label="Cuisines" name="cuisines" value={form?.cuisines || ''} onChange={(event) => changeProfile('cuisines', event.target.value)} maxLength={160} error={errors.cuisines}/><Field label="Phone" name="phone" value={form?.phone || ''} onChange={(event) => changeProfile('phone', event.target.value)} maxLength={20} error={errors.phone}/><Field className="field-span" as="textarea" label="Address" name="address" value={form?.address || ''} onChange={(event) => changeProfile('address', event.target.value)} maxLength={255} error={errors.address}/><Field className="field-span" as="textarea" label="Description" name="description" value={form?.description || ''} onChange={(event) => changeProfile('description', event.target.value)} maxLength={10000} error={errors.description}/><Field className="field-span" label="Logo URL (secure HTTPS only)" name="logo_url" value={form?.logo_url || ''} onChange={(event) => changeProfile('logo_url', event.target.value)} error={errors.logo_url}/><div className="field-span"><ImagePreview src={form?.logo_url} label="Hotel logo preview" kind="logo"/></div><Field className="field-span" label="Cover URL (secure HTTPS only)" name="cover_url" value={form?.cover_url || ''} onChange={(event) => changeProfile('cover_url', event.target.value)} error={errors.cover_url}/><div className="field-span"><ImagePreview src={form?.cover_url} label="Hotel cover preview"/></div></div>{formError && <p className="admin-inline-error" role="alert">{formError}</p>}<div className="admin-form-actions"><button className="button button-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save profile'}</button></div></form>
    <section className="admin-form-section"><div className="admin-section-heading"><div><h2>Hotel administrators</h2><p>Removing a link leaves the user's account active.</p></div><Button onClick={() => { setAddMode(true); setAdminMode('link'); setAdminErrors({}); setAdminError(''); }}><UserPlus size={17}/> Add admin</Button></div>
      {adminsQuery.isPending && !admins.length ? <AdminLoading rows={2}/> : adminsQuery.isError && !admins.length ? <AdminError error={{ ...adminsQuery.error, message: displayError(adminsQuery.error) }} retry={adminsQuery.refetch}/> : !admins.length ? <AdminEmpty title="No administrators linked" detail="Add an existing user or create a new administrator account."/> : <DataTable columns={adminColumns} rows={admins} rowKey={(user) => user.id} renderMobile={(user) => <><div className="admin-mobile-field"><span>Name</span><strong>{user.full_name}</strong></div><div className="admin-mobile-field"><span>Email</span><strong>{user.email}</strong></div><div className="admin-mobile-field"><span>Phone</span><strong>{user.phone}</strong></div><div className="admin-mobile-actions"><button type="button" className="button button-danger" onClick={() => setRemoving(user)}>Remove</button></div></>}/>}
      <LoadMore hasMore={(adminsQuery.data?.meta?.totalPages || 1) > page} loading={adminsQuery.isFetching} onClick={() => setPage((value) => value + 1)}/>
    </section>
    {addMode && <Sheet title="Add hotel administrator" onClose={() => !add.isPending && setAddMode(null)}><Tabs label="Administrator mode" value={adminMode} onChange={(value) => { setAdminMode(value); setAdminErrors({}); setAdminError(''); }} items={[{ value: 'link', label: 'Link existing user' }, { value: 'create', label: 'Create new admin' }]}/><p className="muted">{adminMode === 'link' ? 'Enter the email address of an existing active customer.' : 'Creates a customer account and links it to this hotel in one request.'}</p>{adminError && <p className="admin-inline-error" role="alert">{adminError}</p>}<form onSubmit={submitAdmin} noValidate>{adminMode === 'link' ? <Field label="Existing user email" name="email" type="email" value={adminForm.email} onChange={(event) => { setAdminForm((old) => ({ ...old, email: event.target.value })); setAdminErrors((old) => ({ ...old, email: undefined })); }} error={adminErrors.email}/> : <><Field label="Full name" name="full_name" value={adminForm.full_name} onChange={(event) => setAdminForm((old) => ({ ...old, full_name: event.target.value }))} error={adminErrors.full_name}/><Field label="Email" name="email" type="email" value={adminForm.email} onChange={(event) => setAdminForm((old) => ({ ...old, email: event.target.value }))} error={adminErrors.email}/><Field label="Phone" name="phone" type="tel" value={adminForm.phone} onChange={(event) => setAdminForm((old) => ({ ...old, phone: event.target.value }))} error={adminErrors.phone}/><Field label="Password" name="password" type={showPassword ? 'text' : 'password'} value={adminForm.password} onChange={(event) => setAdminForm((old) => ({ ...old, password: event.target.value }))} error={adminErrors.password}/><button type="button" className="admin-password-toggle" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>} {showPassword ? 'Hide password' : 'Show password'}</button></>}<div className="admin-form-actions"><button type="button" className="button button-secondary" disabled={add.isPending} onClick={() => setAddMode(null)}>Cancel</button><button className="button button-primary" disabled={add.isPending}>{add.isPending ? 'Saving…' : adminMode === 'link' ? 'Link user' : 'Create admin'}</button></div></form></Sheet>}
    {removing && <ConfirmDialog title={`Remove ${removing.full_name}?`} danger confirmLabel="Remove admin link" pending={remove.isPending} onClose={() => setRemoving(null)} onConfirm={() => remove.mutate(removing.id)}><p>This only removes their administrator access to this hotel. Their user account and customer history stay active.</p></ConfirmDialog>}
    {statusConfirm && <ConfirmDialog title={hotel.status === 'active' ? 'Suspend this hotel?' : ['pending', 'rejected'].includes(hotel.status) ? 'Activate legacy hotel?' : 'Reactivate this hotel?'} danger={hotel.status === 'active'} confirmLabel={hotel.status === 'active' ? 'Suspend hotel' : 'Activate hotel'} pending={statusChange.isPending} onClose={() => setStatusConfirm(false)} onConfirm={() => statusChange.mutate(hotel.status === 'active' ? 'suspended' : 'active')}><p>{hotel.status === 'active' ? 'Customers will no longer find or order from this hotel.' : ['pending', 'rejected'].includes(hotel.status) ? 'This legacy hotel will become active and publicly available.' : 'Customers and hotel administrators will be able to use this hotel again.'}</p></ConfirmDialog>}
  </section>;
}
