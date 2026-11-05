import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, LoaderCircle, Minus, Plus, X } from 'lucide-react';
export function Button({ children, variant = 'primary', className = '', ...props }) { return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>; }
export function ErrorState({ error, retry }) { return <div className="state-panel" role="alert"><AlertCircle size={24}/><strong>We couldn’t load this</strong><span>{error?.message || 'Please try again in a moment.'}</span>{retry && <Button variant="secondary" onClick={retry}>Retry</Button>}</div>; }
export function EmptyState({ title, action = 'Browse hotels', to = '/' }) { return <div className="state-panel"><span className="empty-icon">⌂</span><strong>{title}</strong><Link className="button button-primary" to={to}>{action}</Link></div>; }
export function Skeleton({ count = 3 }) { return <div className="skeleton-grid" aria-label="Loading">{Array.from({ length: count }, (_, i) => <div className="skeleton-card" key={i}><div className="skeleton-cover"/><div className="skeleton-line"/><div className="skeleton-line short"/></div>)}</div>; }
export function Stepper({ qty, onIncrement, onDecrement, label = 'quantity' }) { return qty > 0 ? <div className="stepper" aria-label={`${label}: ${qty}`}><button aria-label={`Decrease ${label}`} onClick={onDecrement}><Minus size={15}/></button><span aria-live="polite">{qty}</span><button aria-label={`Increase ${label}`} onClick={onIncrement}><Plus size={15}/></button></div> : <Button className="add-button" variant="secondary" onClick={onIncrement}>ADD</Button>; }
export function VegMark({ veg }) { return <span className={`veg-mark ${veg ? 'is-veg' : 'is-nonveg'}`} aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'}><i/></span>; }
export function StatusChip({ status }) { const value = String(status || '').toLowerCase(); return <span className={`status-chip status-${value}`}>{value}</span>; }
export function Dialog({ title, children, onClose, className = '', open = true }) {
  const ref = React.useRef(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const fields = () => ref.current?.querySelectorAll('input:not(:disabled):not([type="hidden"]),textarea:not(:disabled),select:not(:disabled)');
    const focusable = () => ref.current?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]');
    const initialTarget = fields()?.[0] || ref.current?.querySelector('[data-dialog-heading]');
    initialTarget?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const list = [...(focusable() || [])];
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previous?.isConnected) previous.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseRef.current?.(); }}>
    <section ref={ref} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <button type="button" className="icon-button dialog-close" aria-label="Close" onClick={() => onCloseRef.current?.()}><X/></button>
      <h2 id="dialog-title" data-dialog-heading tabIndex={-1}>{title}</h2>
      {children}
    </section>
  </div>;
}
export function Toast({ message, persistent = false, onClose }) { if (!message) return null; return <div className="toast" role="status" aria-live="polite"><Check size={18}/>{message}{persistent && <button aria-label="Dismiss" onClick={onClose}>×</button>}</div>; }
export function LoadingButton({ pending, children, ...props }) { return <Button disabled={pending || props.disabled} {...props}>{pending && <LoaderCircle className="spin" size={17}/>} {children}</Button>; }
