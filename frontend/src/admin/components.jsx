import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, ChevronDown, X } from 'lucide-react';
import { Dialog, ErrorState, LoadingButton, Skeleton } from '../components/ui/index.jsx';
import { SafeImage } from '../lib/images.jsx';

const NoticeContext = React.createContext(() => {});
export function NoticeProvider({ children }) {
  const [notice, setNotice] = React.useState(null);
  const show = React.useCallback((message, kind = 'success', persistent = false) => {
    setNotice({ message, kind, persistent });
    if (!persistent) window.setTimeout(() => setNotice((old) => old?.message === message ? null : old), 3200);
  }, []);
  return <NoticeContext.Provider value={show}>{children}{notice && <div className={`toast admin-toast toast-${notice.kind}`} role="status" aria-live="polite"><span>{notice.kind === 'error' ? <AlertCircle size={18}/> : <Check size={18}/>}</span>{notice.message}{notice.persistent && <button aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>}</div>}</NoticeContext.Provider>;
}
export const useNotice = () => React.useContext(NoticeContext);

export function Tabs({ items, value, onChange, label = 'Sections' }) {
  return <div className="tabs admin-tabs" role="tablist" aria-label={label}>{items.map((item) => <button type="button" role="tab" aria-selected={value === item.value} className={value === item.value ? 'active' : ''} key={item.value} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}

export function DataTable({ columns, rows, rowKey = (row) => row.id, renderMobile, onRowClick, rowClassName }) {
  if (!rows.length) return null;
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={rowKey(row)} className={`${onRowClick ? 'clickable-row' : ''} ${rowClassName?.(row) || ''}`} onClick={onRowClick ? () => onRowClick(row) : undefined}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>)}</tbody></table><div className="admin-mobile-cards">{rows.map((row) => <article key={rowKey(row)} className={`admin-mobile-card ${rowClassName?.(row) || ''}`}>{renderMobile ? renderMobile(row) : columns.map((column) => <div className="admin-mobile-field" key={column.key}><span>{column.label}</span><strong>{column.render ? column.render(row) : row[column.key]}</strong></div>)}</article>)}</div></div>;
}

export function ConfirmDialog({ title, children, confirmLabel = 'Confirm', danger = false, pending = false, onConfirm, onClose }) {
  return <Dialog title={title} onClose={onClose}><div className="admin-dialog-copy">{children}</div><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><LoadingButton type="button" className={danger ? 'button-danger' : ''} pending={pending} onClick={onConfirm}>{confirmLabel}</LoadingButton></div></Dialog>;
}

export function Sheet({ title, onClose, children }) {
  return <Dialog title={title} onClose={onClose} className="admin-sheet">{children}</Dialog>;
}

export function Field({ label, name, error, className = '', as: Element = 'input', ...props }) {
  const id = props.id || `admin-${name}`;
  return <label className={`field-label admin-field ${className}`} htmlFor={id}>{label}<Element {...props} id={id} name={name} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}/>{error && <small className="form-error" id={`${id}-error`}>{error}</small>}</label>;
}

export function Toggle({ label, checked, onChange, disabled = false, description, name }) {
  return <label className={`admin-toggle ${disabled ? 'is-disabled' : ''}`}><span className="admin-toggle-copy"><strong>{label}</strong>{description && <small>{description}</small>}</span><input type="checkbox" role="switch" name={name} checked={Boolean(checked)} disabled={disabled} onChange={(event) => onChange(event.target.checked)}/><span className="admin-toggle-track" aria-hidden="true"/></label>;
}

export function ImagePreview({ src, label = 'Image preview', kind = 'hotel' }) {
  return <div className="admin-image-preview"><SafeImage src={src} alt={label} kind={kind} width={176} height={112}/><span>{label}</span></div>;
}

export function LoadMore({ hasMore, loading, onClick }) {
  if (!hasMore) return null;
  return <button type="button" className="button button-secondary load-more" disabled={loading} onClick={onClick}>{loading ? 'Loading…' : 'Load more'}</button>;
}

export function AdminLoading({ rows = 4 }) {
  return <div className="admin-skeleton" aria-label="Loading"><Skeleton count={Math.min(rows, 4)}/></div>;
}

export function AdminError({ error, retry }) {
  return <ErrorState error={error} retry={retry}/>;
}

export function AdminEmpty({ title, detail = 'There is nothing to show yet.' }) {
  return <div className="state-panel admin-empty"><span className="empty-icon"><ChevronDown size={22}/></span><strong>{title}</strong><span>{detail}</span></div>;
}

export function PageHeading({ eyebrow, title, actions }) {
  return <div className="admin-page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1></div>{actions && <div className="admin-heading-actions">{actions}</div>}</div>;
}

export function Breadcrumb({ children }) { return <Link to="/account" className="admin-back-link">← Account</Link>; }
