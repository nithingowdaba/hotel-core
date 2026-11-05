import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { formatMoney } from '../lib/format.js';
import { SafeImage } from '../lib/images.jsx';
import { VegMark } from '../components/ui/index.jsx';
import { AdminEmpty, AdminError, AdminLoading, Field, ImagePreview, PageHeading, Sheet, Toggle, useNotice } from './components.jsx';
import { adminApi, adminKeys, displayError, fieldErrors } from './api.js';

const blank = { name: '', category: '', price: '', is_veg: true, description: '', image_url: '', is_available: true };
function pricePaise(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const [whole, fraction = ''] = String(value).split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}
const paiseToPrice = (paise) => `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
const grouped = (payload) => payload?.categories || [];

export default function AdminMenu() {
  const { hotelId, suspended } = useOutletContext();
  const client = useQueryClient();
  const notify = useNotice();
  const query = useQuery({ queryKey: adminKeys.menu(hotelId), queryFn: () => adminApi.menu(hotelId), staleTime: 30000, retry: (n, e) => e.status >= 400 && e.status < 500 ? false : n < 1 });
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(blank);
  const [errors, setErrors] = React.useState({});
  const [formError, setFormError] = React.useState('');
  const categories = grouped(query.data);
  const names = [...new Set(categories.map((item) => item.name))].sort((a, b) => a.localeCompare(b));
  const visible = categories.map((group) => ({ ...group, items: (group.items || []).filter((item) => (category === 'all' || group.name === category) && (!search || `${item.name} ${item.description || ''}`.toLowerCase().includes(search.toLowerCase()))) })).filter((group) => group.items.length);
  const mutation = useMutation({
    mutationFn: ({ mode, id, body }) => mode === 'create' ? adminApi.createItem(hotelId, body) : adminApi.updateItem(hotelId, id, body),
    onSuccess: () => { client.invalidateQueries({ queryKey: adminKeys.menu(hotelId) }); setEditing(null); notify(editing?.mode === 'create' ? 'Menu item added.' : 'Menu item updated.'); },
    onError: (error) => { setErrors(fieldErrors(error)); setFormError(error.code === 'MENU_ITEM_EXISTS' ? displayError(error) : ''); if (error.code !== 'MENU_ITEM_EXISTS' && !fieldErrors(error).name && !fieldErrors(error).category) notify(displayError(error), 'error'); },
  });
  const availability = useMutation({
    mutationFn: ({ id, value }) => adminApi.availability(hotelId, id, value),
    onMutate: async ({ id, value }) => {
      await client.cancelQueries({ queryKey: adminKeys.menu(hotelId) });
      const previous = client.getQueryData(adminKeys.menu(hotelId));
      client.setQueryData(adminKeys.menu(hotelId), (data) => data && ({ ...data, categories: data.categories.map((group) => ({ ...group, items: group.items.map((item) => Number(item.id) === Number(id) ? { ...item, is_available: value } : item) })) }));
      return { previous };
    },
    onError: (error, variables, context) => { if (context?.previous) client.setQueryData(adminKeys.menu(hotelId), context.previous); notify(displayError(error), 'error'); },
    onSuccess: (_, variables) => notify(variables.value ? 'Item is available.' : 'Item marked sold out.'),
    onSettled: () => client.invalidateQueries({ queryKey: adminKeys.menu(hotelId) }),
  });

  const openCreate = () => { setEditing({ mode: 'create' }); setForm(blank); setErrors({}); setFormError(''); };
  const openEdit = (item) => { setEditing({ mode: 'edit', id: item.id, item }); setForm({ name: item.name || '', category: item.category || '', price: paiseToPrice(pricePaise(String(item.price))), is_veg: Boolean(item.is_veg), description: item.description || '', image_url: item.image_url || '', is_available: Boolean(item.is_available) }); setErrors({}); setFormError(''); };
  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })); setFormError(''); };
  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (!form.name.trim() || form.name.trim().length > 120) next.name = 'Name is required and must be 1–120 characters.';
    if (!form.category.trim() || form.category.trim().length > 80) next.category = 'Category is required and must be 1–80 characters.';
    const paise = pricePaise(form.price);
    if (paise === null || paise <= 0) next.price = 'Enter a price greater than zero with no more than two decimal places.';
    if (form.image_url && !form.image_url.startsWith('https:' + '//')) next.image_url = 'Enter a secure HTTPS image URL.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const full = { name: form.name.trim(), category: form.category.trim(), price: paiseToPrice(paise), is_veg: form.is_veg, description: form.description.trim(), image_url: form.image_url.trim() || null, is_available: form.is_available };
    const body = editing.mode === 'create' ? full : Object.fromEntries(Object.entries(full).filter(([key, value]) => value !== editing.item[key] && !(value === null && !editing.item[key])));
    if (editing.mode === 'edit' && !Object.keys(body).length) { setEditing(null); return; }
    mutation.mutate({ mode: editing.mode, id: editing.id, body });
  };

  if (query.isPending) return <section className="admin-page"><AdminLoading rows={4}/></section>;
  if (query.isError) return <section className="admin-page"><PageHeading eyebrow="HOTEL WORKSPACE" title="Menu manager"/><AdminError error={{ ...query.error, message: displayError(query.error) }} retry={query.refetch}/></section>;
  return <section className="admin-page">
    <PageHeading eyebrow="HOTEL WORKSPACE" title="Menu manager" actions={<button type="button" className="button button-primary" disabled={suspended} onClick={openCreate}><Plus size={17}/> Add item</button>}/>
    <div className="admin-toolbar"><label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Search menu items" placeholder="Search menu items" value={search} onChange={(event) => setSearch(event.target.value)}/></label><label className="admin-filter-label">Category <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{names.map((name) => <option key={name}>{name}</option>)}</select></label></div>
    {!visible.length ? <AdminEmpty title="No menu items found" detail={search || category !== 'all' ? 'Try another search or category.' : 'Add the first item to this hotel menu.'}/> : <div className="admin-menu-list">{visible.map((group) => <section className="admin-category" key={group.name}><h2>{group.name}</h2>{group.items.map((item) => <article className="admin-menu-row" key={item.id}><SafeImage className="admin-menu-image" src={item.image_url} alt={item.name} kind="dish" width={72} height={72}/><div className="admin-menu-copy"><div className="admin-menu-title"><VegMark veg={item.is_veg}/><h3>{item.name}</h3>{!item.is_available && <span className="status-chip status-cancelled">Sold out</span>}</div><strong>{formatMoney(item.price)}</strong>{item.description && <p>{item.description}</p>}</div><div className="admin-menu-controls"><Toggle label={item.is_available ? 'Available' : 'Sold out'} checked={item.is_available} disabled={suspended || availability.isPending && String(availability.variables?.id) === String(item.id)} onChange={(value) => availability.mutate({ id: item.id, value })}/><button type="button" className="button button-secondary" disabled={suspended} onClick={() => openEdit(item)}><Pencil size={15}/> Edit</button></div></article>)}</section>)}</div>}
    {editing && <Sheet title={editing.mode === 'create' ? 'Add menu item' : `Edit ${editing.item.name}`} onClose={() => !mutation.isPending && setEditing(null)}><form onSubmit={submit} noValidate>
      {formError && <p className="admin-inline-error" role="alert">{formError}</p>}
      <div className="admin-form-grid"><Field label="Item name" name="name" value={form.name} onChange={(event) => update('name', event.target.value)} maxLength={120} required error={errors.name}/><Field as="input" list="menu-categories" label="Category" name="category" value={form.category} onChange={(event) => update('category', event.target.value)} maxLength={80} required error={errors.category}/><datalist id="menu-categories">{names.map((name) => <option key={name} value={name}/>)}</datalist><Field label="Price (₹)" name="price" inputMode="decimal" value={form.price} onChange={(event) => update('price', event.target.value)} placeholder="e.g. 85.00" required error={errors.price}/><div className="field-span"><Toggle label="Vegetarian" description={form.is_veg ? 'This dish is vegetarian.' : 'This dish is non-vegetarian.'} checked={form.is_veg} onChange={(value) => update('is_veg', value)}/></div><Field as="textarea" className="field-span" label="Description" name="description" value={form.description} onChange={(event) => update('description', event.target.value)} maxLength={2000}/><Field className="field-span" label="Image URL (secure HTTPS only)" name="image_url" type="url" value={form.image_url} onChange={(event) => update('image_url', event.target.value)} error={errors.image_url}/><div className="field-span"><ImagePreview src={form.image_url} label="Menu image preview" kind="dish"/></div><div className="field-span"><Toggle label="Available to order" checked={form.is_available} onChange={(value) => update('is_available', value)}/></div></div>
      <div className="admin-form-actions"><button type="button" className="button button-secondary" disabled={mutation.isPending} onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" disabled={mutation.isPending || suspended}>{mutation.isPending ? 'Saving…' : editing.mode === 'create' ? 'Add item' : 'Save changes'}</button></div>
    </form></Sheet>}
  </section>;
}
