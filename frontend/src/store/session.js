import { create } from 'zustand';
const read = () => { try { return JSON.parse(sessionStorage.getItem('hotel-core-session') || '{}'); } catch { return {}; } };
export const useSession = create((set) => ({ ...read(), setSession: (token, user) => { const value = { token, user }; sessionStorage.setItem('hotel-core-session', JSON.stringify(value)); set(value); }, clearSession: () => { sessionStorage.removeItem('hotel-core-session'); set({ token: null, user: null }); } }));
