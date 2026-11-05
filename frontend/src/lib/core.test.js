import { describe, expect, it, vi, beforeEach } from 'vitest';
import { formatMoney, formatDate, sumPaise } from './format.js';
import { safeNext } from './safeNext.js';
import { allowedImage } from './images.jsx';
import { ApiError, apiRequest } from '../api/client.js';
import { useSession } from '../store/session.js';

describe('format helpers',()=>{it('formats INR and IST dates',()=>{expect(formatMoney(125)).toContain('125.00');expect(formatDate('2024-01-01T00:00:00Z')).toContain('2024');});it('adds cart lines using integer paise',()=>{expect(sumPaise([{price:10.01,qty:3},{price:2.5,qty:2}])).toBe(3503);});});
describe('safeNext',()=>{it.each(['https://evil.com','//evil.com','javascript:alert(1)','/\\evil.com','/%2f%2fevil.com','/%5c%5cevil.com'])('rejects %s',(x)=>expect(safeNext(x)).toBe('/'));it('accepts same app path',()=>expect(safeNext('/cart')).toBe('/cart'));});
describe('image URL guard',()=>{it.each(['http://x','data:image/svg+xml,x','javascript:alert(1)','//evil.com'])('rejects %s',(x)=>expect(allowedImage(x)).toBe(false));it('allows secure and local images',()=>{expect(allowedImage('https://img.example/a')).toBe(true);expect(allowedImage('/img/a')).toBe(true);});});
describe('API client',()=>{beforeEach(()=>{useSession.getState().clearSession();vi.restoreAllMocks();});it('returns envelope data and maps errors',async()=>{global.fetch=vi.fn().mockResolvedValueOnce({ok:true,status:200,json:async()=>({success:true,data:{x:1}})}).mockResolvedValueOnce({ok:false,status:409,json:async()=>({success:false,error:{code:'NO',message:'No',details:[1]}})});expect(await apiRequest('/x')).toEqual({x:1});await expect(apiRequest('/x')).rejects.toMatchObject({code:'NO',status:409,details:[1]});});it('maps network errors',async()=>{global.fetch=vi.fn().mockRejectedValue(new Error('offline'));await expect(apiRequest('/x')).rejects.toBeInstanceOf(ApiError);await expect(apiRequest('/x')).rejects.toMatchObject({code:'OFFLINE'});});});
