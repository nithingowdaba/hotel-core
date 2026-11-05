export function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  let decoded = value;
  try { for (let i = 0; i < 8; i += 1) { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next; } } catch { return '/'; }
  if (/%(?:2f|5c|3a)/i.test(decoded) || /%[0-9a-f]{2}/i.test(decoded) || !decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\') || /^[\s]*[a-z][a-z\d+.-]*:/i.test(decoded)) return '/';
  return value;
}
