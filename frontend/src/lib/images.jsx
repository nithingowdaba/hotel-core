import React from 'react';
export const allowedImage = (value) => typeof value === 'string' && (value.startsWith('https:' + '/'.repeat(2)) || (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')));
export function Placeholder({ kind = 'hotel', label = 'Hotel image placeholder', className = '', width = 96, height = 96 }) {
  const classNames = `placeholder placeholder-${kind} ${className}`.trim();
  const dimensions = { aspectRatio: `${width} / ${height}` };
  if (kind === 'dish') {
    return <div className={classNames} style={dimensions} role="img" aria-label={label}><svg viewBox="0 0 80 60" aria-hidden="true"><rect x="8" y="10" width="64" height="42" rx="8" fill="currentColor" opacity=".12"/><circle cx="29" cy="25" r="5" fill="currentColor" opacity=".35"/><path d="M20 44c8-16 32-16 40 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>;
  }
  return <div className={classNames} style={dimensions} role="img" aria-label={label}>
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <rect x="8" y="8" width="104" height="74" rx="15" fill="#fff" fillOpacity=".72"/>
      <path d="M25 39h70v34H25z" fill="#fff" stroke="#d9c6b7" strokeWidth="2"/>
      <path d="M20 38l8-17h64l8 17z" fill="#ff6a13"/>
      <path d="M28 21l8 17M48 21l4 17M68 21l-2 17M88 21l-8 17" stroke="#fff2e8" strokeWidth="8"/>
      <path d="M47 50h15v23H47zM70 50h17v13H70z" fill="#ffe3ce" stroke="#d9c6b7" strokeWidth="2"/>
      <path d="M20 39h80" stroke="#e55a0a" strokeWidth="3"/>
    </svg>
  </div>;
}
export function SafeImage({ src, alt, kind = 'hotel', className = '', width = 96, height = 96, loading = 'lazy' }) {
  const [failed, setFailed] = React.useState(!allowedImage(src));
  React.useEffect(() => setFailed(!allowedImage(src)), [src]);
  return failed ? <Placeholder className={className} kind={kind} label={alt || 'Hotel image placeholder'} width={width} height={height}/> : <img className={className} src={src} alt={alt} width={width} height={height} loading={loading} onError={() => setFailed(true)} />;
}
