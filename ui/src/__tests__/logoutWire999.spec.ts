import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { api, setToken, getToken, setHostToken, setAuthSettled } from '../api';
import { useAuthStore } from '../stores/auth';

/* 999：登出服务端失效接线。
 * 契约——auth store 的 logout() 在本地清理前先尽力调用 POST /auth/logout 通知服务端
 * 吊销令牌：fire-and-forget（请求在途/失败都不阻塞、不影响本地清理），令牌头在发车前
 * 快照（随后才 clearToken）；'/auth/logout' 进 AUTH_GATE_EXEMPT（宿主门未释放也直发，
 * 登出时可能已无身份，不得死等）。另锁 api.ts 死声明 rebuild（POST /internal/es/index/rebuild）
 * 退役的负锚——端点已退役，防声明回潮。 */

const calls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  /* 门状态复位：模块级状态跨用例泄漏会让非门用例意外挂起 */
  setHostToken('');
  setAuthSettled(Promise.resolve());
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.unstubAllGlobals();
  setHostToken('');
  setAuthSettled(Promise.resolve());
});

describe('auth.logout 服务端失效接线（999）', () => {
  it('登出调用 POST /auth/logout，令牌头先于 clearToken 快照，本地清理照旧完成', async () => {
    setToken('t-999');
    const auth = useAuthStore();
    auth.logout();
    /* 发车即快照：fetch 已收到带令牌的请求（此刻本地 token 已被同步清理） */
    expect(calls.length).toBe(1);
    expect(calls[0]!.url.endsWith('/internal/es/index/auth/logout')).toBe(true);
    expect(calls[0]!.init.method).toBe('POST');
    expect(((calls[0]!.init.headers || {}) as Record<string, string>)['X-ESQueryStudio-Token']).toBe('t-999');
    expect(getToken()).toBe('');
    await new Promise(r => setTimeout(r, 0));
    expect(auth.me).toBeNull();
    expect(auth.showLogin).toBe(true);
  });

  it('服务端不可达（网络错）吞错不炸：令牌仍清、遮罩仍弹', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    setToken('t-999');
    const auth = useAuthStore();
    auth.logout();
    await new Promise(r => setTimeout(r, 0));
    expect(getToken()).toBe('');
    expect(auth.me).toBeNull();
    expect(auth.showLogin).toBe(true);
  });

  it('请求在途（永不 settle）不阻塞登出：本地清理同步完成', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    setToken('t-999');
    const auth = useAuthStore();
    auth.logout();
    /* 不 await 任何东西：吊销请求挂在天上，登出照常落地 */
    expect(getToken()).toBe('');
    expect(auth.me).toBeNull();
    expect(auth.showLogin).toBe(true);
  });
});

describe('AUTH_GATE_EXEMPT 含 /auth/logout（999：登出不得死等宿主授权门）', () => {
  it('宿主令牌在途+门未释放：登出请求直发（豁免语义与 /auth/me 同族）', async () => {
    setHostToken('host-t');
    let release!: () => void;
    setAuthSettled(new Promise<void>(r => { release = r; }));
    const p = api.auth.logout();
    await new Promise(r => setTimeout(r, 30));
    expect(calls.length).toBe(1); /* 门未开也直发：登出时可能已无身份 */
    release();
    await p;
  });
});

describe('999 源码锁（负锚防回潮 + 接线形态）', () => {
  const apiSrc = readFileSync(resolve(__dirname, '../api.ts'), 'utf8');
  const authSrc = readFileSync(resolve(__dirname, '../stores/auth.ts'), 'utf8');

  it('api.ts 死声明 rebuild 退役（后端端点已下线，全站零调用）', () => {
    expect(apiSrc).not.toContain('rebuild: (indexKey');
    /* 手工触发的空索引重建仍在，防误删相邻声明 */
    expect(apiSrc).toContain('rebuildEmpty: (indexKey');
  });

  it('豁免数组与登出端点声明在位；store 登出为吞错 fire-and-forget 形态', () => {
    expect(apiSrc).toContain("'/auth/me', '/auth/login', '/auth/logout'");
    expect(apiSrc).toContain("logout: () => post<any>('/auth/logout')");
    expect(authSrc).toMatch(/void api\.auth\.logout\(\)\.catch/);
  });
});
