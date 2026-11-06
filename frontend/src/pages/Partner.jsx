import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { keys } from '../api/hooks.js';
import { useSession } from '../store/session.js';
import { LoadingButton } from '../components/ui/index.jsx';

const empty = { ownerName: '', email: '', password: '', name: '', phone: '', address: '', cuisines: '', description: '', image_url: '' };

export default function Partner() {
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = React.useState(empty);
  const [error, setError] = React.useState('');
  const submit = useMutation({
    mutationFn: (body) => api.registerHotel(body),
    onSuccess: (result) => {
      if (result.token) useSession.getState().setSession(result.token, result.user);
      client.setQueryData(keys.me, result.user || client.getQueryData(keys.me));
      client.invalidateQueries({ queryKey: keys.me });
      client.invalidateQueries({ queryKey: keys.myHotels });
      navigate(`/admin/${result.hotel.id}/settings`, { replace: true });
    },
    onError: (failure) => setError(failure.code === 'EMAIL_IN_USE'
      ? 'An account already uses this email. Log in first, then add your hotel.'
      : failure.code === 'SLUG_IN_USE'
        ? 'A hotel with a similar name already exists. Contact platform support.'
        : failure.message),
  });
  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError('');
  };
  const onSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return setError('Hotel name and phone are required.');
    if (!token && (!form.ownerName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
      || form.password.length < 8 || form.password.length > 72)) {
      return setError('Enter a valid owner name, email, and password of 8–72 characters.');
    }
    const hotel = Object.fromEntries(['name', 'phone', 'address', 'cuisines', 'description', 'image_url']
      .filter((key) => form[key].trim()).map((key) => [key, form[key].trim()]));
    submit.mutate(token ? { hotel } : {
      owner: { name: form.ownerName.trim(), email: form.email.trim(), password: form.password }, hotel,
    });
  };
  return <main className="page partner-page">
    <Link to="/" className="back-link">← Back to Hotel Core</Link>
    <p className="eyebrow">HOTEL PARTNERS</p><h1>Bring your hotel to Hotel Core</h1>
    <p className="muted">Register your hotel and start managing its menu and profile right away.</p>
    <form className="partner-form" onSubmit={onSubmit} noValidate>
      {!token && <section><h2>Account</h2><Field label="Owner name" name="ownerName" value={form.ownerName} onChange={update} required autoComplete="name"/><Field label="Email" name="email" type="email" value={form.email} onChange={update} required autoComplete="email"/><Field label="Password" name="password" type="password" value={form.password} onChange={update} required minLength={8} maxLength={72} autoComplete="new-password"/></section>}
      <section><h2>Hotel details</h2><Field label="Hotel name" name="name" value={form.name} onChange={update} required maxLength={120}/><Field label="Phone" name="phone" type="tel" value={form.phone} onChange={update} required maxLength={20}/><Field label="Address" name="address" value={form.address} onChange={update} maxLength={255}/><Field label="Cuisine" name="cuisines" value={form.cuisines} onChange={update} maxLength={160}/><label className="field-label">Description<textarea name="description" value={form.description} onChange={update} maxLength={10000}/></label><Field label="Cover image URL (HTTPS)" name="image_url" type="url" value={form.image_url} onChange={update}/></section>
      {error && <p role="alert" className="form-error">{error}</p>}
      <LoadingButton className="button-primary" pending={submit.isPending}>{submit.isPending ? 'Creating hotel…' : 'Register hotel'}</LoadingButton>
      {!token && <p className="muted">Already have an account? <Link to="/login">Log in</Link> before submitting your hotel.</p>}
    </form>
  </main>;
}

function Field({ label, name, ...props }) {
  return <label className="field-label">{label}<input name={name} {...props}/></label>;
}
