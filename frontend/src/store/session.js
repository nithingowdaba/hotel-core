import { create } from 'zustand';
const read = () => { try { return JSON.parse(sessionStorage.getItem('hotel-core-session') || '{}'); } catch { return {}; } };
export const useSession = create((set, get) => ({
  ...read(),
  setSession: (token, user) => {
    const current = get();
    const authenticatedAt = current.token === token ? current.authenticatedAt || Date.now() : Date.now();
    const value = { token, user, authenticatedAt };
    sessionStorage.setItem('hotel-core-session', JSON.stringify(value));
    set(value);
  },
  clearSession: () => {
    sessionStorage.removeItem('hotel-core-session');
    set({ token: null, user: null, authenticatedAt: null });
  },
}));
