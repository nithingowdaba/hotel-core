import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Field, ImagePreview, PageHeading, Toggle, useNotice } from './components.jsx';
import { adminApi, adminKeys, displayError, fieldErrors } from './api.js';

const profileKeys = ['description', 'cuisines', 'address', 'phone', 'logo_url', 'cover_url'];
const initial = (hotel) => Object.fromEntries(profileKeys.map((key) => [key, hotel?.[key] || '']));

export default function AdminSettings() {
  const { hotelId, hotel, suspended } = useOutletContext();
  const client = useQueryClient();
  const notify = useNotice();
  const [form, setForm] = React.useState(() => initial(hotel));
  const [errors, setErrors] = React.useState({});
  const [formError, setFormError] = React.useState('');
  React.useEffect(() => { setForm(initial(hotel)); }, [hotel]);
  const saveProfile = useMutation({
    mutationFn: (body) => adminApi.updateHotel(hotelId, body),
    onSuccess: (updated) => { client.setQueryData(adminKeys.hotel(hotelId), updated); setErrors({}); setFormError(''); notify('Hotel profile saved.'); },
    onError: (error) => { const fields = fieldErrors(error); setErrors(fields); setFormError(Object.keys(fields).length ? 'Review the highlighted fields.' : displayError(error)); },
  });
  const toggleOpen = useMutation({
    mutationFn: (value) => adminApi.updateHotel(hotelId, { accepting_orders: value }),
    onMutate: async (value) => { await client.cancelQueries({ queryKey: adminKeys.hotel(hotelId) }); const previous = client.getQueryData(adminKeys.hotel(hotelId)); client.setQueryData(adminKeys.hotel(hotelId), (current) => current && ({ ...current, accepting_orders: value })); return { previous }; },
    onError: (error, _value, context) => { if (context?.previous) client.setQueryData(adminKeys.hotel(hotelId), context.previous); notify(displayError(error), 'error'); },
    onSuccess: (updated) => { client.setQueryData(adminKeys.hotel(hotelId), updated); notify(updated.accepting_orders ? 'Orders are open.' : 'Orders are closed.'); },
    onSettled: () => client.invalidateQueries({ queryKey: adminKeys.hotel(hotelId) }),
  });
  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })); setFormError(''); };
  const submit = (event) => {
    event.preventDefault();
    const next = {};
    for (const key of ['logo_url', 'cover_url']) if (form[key] && !form[key].startsWith('https:' + '//')) next[key] = 'Enter a secure HTTPS image URL.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const body = Object.fromEntries(profileKeys.filter((key) => form[key] !== (hotel[key] || '')).map((key) => [key, form[key].trim() || null]));
    if (!Object.keys(body).length) { notify('There are no profile changes to save.'); return; }
    saveProfile.mutate(body);
  };
  return <section className="admin-page"><PageHeading eyebrow="HOTEL WORKSPACE" title="Hotel settings"/>
    {hotel.status === 'active' && <div className="admin-form-section"><h2>Order availability</h2><Toggle label={hotel.accepting_orders ? 'Accepting orders' : 'Not accepting orders'} description={hotel.accepting_orders ? 'Customers can place orders from this hotel.' : 'Customers can browse, but checkout is disabled.'} checked={hotel.accepting_orders} disabled={suspended || toggleOpen.isPending} onChange={(value) => toggleOpen.mutate(value)}/></div>}
    <form className="admin-form-section" onSubmit={submit} noValidate><h2>Hotel profile</h2><p className="muted admin-readonly-note">Name, slug and platform status can only be changed in the platform console.</p><div className="admin-form-grid"><Field label="Hotel name" name="hotel_name" value={hotel.name || ''} readOnly/><Field label="Slug" name="slug" value={hotel.slug || ''} readOnly/><Field as="textarea" className="field-span" label="Description" name="description" value={form.description} onChange={(event) => update('description', event.target.value)} maxLength={10000}/><Field label="Cuisines" name="cuisines" value={form.cuisines} onChange={(event) => update('cuisines', event.target.value)} maxLength={160} error={errors.cuisines}/><Field label="Phone" name="phone" value={form.phone} onChange={(event) => update('phone', event.target.value)} maxLength={20} error={errors.phone}/><Field as="textarea" className="field-span" label="Address" name="address" value={form.address} onChange={(event) => update('address', event.target.value)} maxLength={255} error={errors.address}/><Field className="field-span" label="Logo URL (secure HTTPS only)" name="logo_url" type="url" value={form.logo_url} onChange={(event) => update('logo_url', event.target.value)} error={errors.logo_url}/><div className="field-span"><ImagePreview src={form.logo_url} label="Hotel logo preview" kind="logo"/></div><Field className="field-span" label="Cover URL (secure HTTPS only)" name="cover_url" type="url" value={form.cover_url} onChange={(event) => update('cover_url', event.target.value)} error={errors.cover_url}/><div className="field-span"><ImagePreview src={form.cover_url} label="Hotel cover preview"/></div></div>{formError && <p className="admin-inline-error" role="alert">{formError}</p>}<div className="admin-form-actions"><button className="button button-primary" disabled={suspended || saveProfile.isPending}>{saveProfile.isPending ? 'Saving…' : 'Save profile'}</button></div></form>
  </section>;
}
