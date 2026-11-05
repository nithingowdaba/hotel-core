/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {
    colors: { brand: 'var(--brand)', 'brand-dark': 'var(--brand-dark)', 'brand-soft': 'var(--brand-soft)', veg: 'var(--veg)', nonveg: 'var(--nonveg)', bg: 'var(--bg)', surface: 'var(--surface)', text: 'var(--text)', muted: 'var(--text-muted)', border: 'var(--border)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', info: 'var(--info)' },
    borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', pill: 'var(--radius-pill)' },
    boxShadow: { 1: 'var(--shadow-1)', 2: 'var(--shadow-2)' },
    spacing: { s1: 'var(--s1)', s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)', s5: 'var(--s5)', s6: 'var(--s6)' },
    fontFamily: { sans: 'var(--font)' },
    fontSize: { xs: 'var(--fs-xs)', sm: 'var(--fs-sm)', md: 'var(--fs-md)', lg: 'var(--fs-lg)', xl: 'var(--fs-xl)' },
  } },
  plugins: [],
};
