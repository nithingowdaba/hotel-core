import React from 'react';
export const allowedImage = (value) => typeof value === 'string' && (value.startsWith('https:' + '/'.repeat(2)) || (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')));
export function Placeholder({ kind = 'hotel', label = 'Image unavailable' }) {
  const dish = kind === 'dish';
  return <div className={`placeholder placeholder-${kind}`} role="img" aria-label={label}><svg viewBox="0 0 80 60" aria-hidden="true"><rect x="8" y="10" width="64" height="42" rx="8" fill="currentColor" opacity=".12"/><circle cx="29" cy="25" r="5" fill="currentColor" opacity=".35"/><path d={dish ? 'M20 44c8-16 32-16 40 0' : 'M18 42l13-13 8 8 10-11 14 16'} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>;
}
export function SafeImage({ src, alt, kind = 'hotel', className = '', width = 96, height = 96, loading = 'lazy' }) {
  const [failed, setFailed] = React.useState(!allowedImage(src));
  React.useEffect(() => setFailed(!allowedImage(src)), [src]);
  return failed ? <div className={`${className} image-${width}x${height}`}><Placeholder kind={kind} /></div> : <img className={className} src={src} alt={alt} width={width} height={height} loading={loading} onError={() => setFailed(true)} />;
}
