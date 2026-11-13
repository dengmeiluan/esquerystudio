/* 纯浏览器模式的本机连接档案。
 *
 * 服务端模式把连接档案存在控制集群的 ES 索引里；浏览器模式没有服务端，
 * 就把同一组字段留在扩展 origin 的 localStorage，并把「当前选中连接」投影成
 * 旧单档键 esquerystudio.browser.profile，兼容已发布的 service worker 采样器。
 *
 * 口径：
 * - 数据面跟随 esquerystudio.target（顶栏切换器写入）；未选目标时用 active 档案。
 * - 密码只在本机流转；编辑时留空=保留旧密码（与服务端 UI 文案一致）。
 * - 旧版单档 {url,username,password} 首次读取时自动迁移成一条档案，零丢失。
 */
export interface BrowserProfile {
  id: string;
  name: string;
  url: string;
  username?: string;
  password?: string;
  authType?: 'BASIC' | 'API_KEY';
  env?: string;
  createdAt?: number;
  updatedAt?: number;
}

export const PROFILES_KEY = 'esquerystudio.browser.profiles';
export const ACTIVE_KEY = 'esquerystudio.browser.active';
export const LEGACY_KEY = 'esquerystudio.browser.profile';
const TARGET_KEY = 'esquerystudio.target';

let migrated = false;
let lastMirroredId = '';

function hostName(url: string): string {
  try { return new URL(url).hostname || url; } catch { return url; }
}
function randomId(): string {
  const arr = new Uint8Array(6);
  try { globalThis.crypto.getRandomValues(arr); }
  catch { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); }
  return 'bp-' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
function cleanUrl(raw: any): string {
  return String(raw || '').trim().replace(/\/+$/, '');
}
function norm(p: any): BrowserProfile | null {
  if (!p || typeof p !== 'object' || !cleanUrl(p.url)) return null;
  const url = cleanUrl(p.url);
  return {
    id: String(p.id || randomId()),
    name: String(p.name || hostName(url)),
    url,
    username: p.username == null ? '' : String(p.username),
    password: p.password == null ? '' : String(p.password),
    authType: p.authType === 'API_KEY' ? 'API_KEY' : 'BASIC',
    env: p.env ? String(p.env) : 'BROWSER',
    createdAt: Number(p.createdAt) || Date.now(),
    updatedAt: Number(p.updatedAt) || Date.now(),
  };
}
function read(): BrowserProfile[] {
  try {
    const arr = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]');
    return Array.isArray(arr) ? arr.map(norm).filter((x): x is BrowserProfile => !!x) : [];
  } catch { return []; }
}
function write(list: BrowserProfile[]): void {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); } catch { /* 存储满/隐私模式：保持内存态由调用方兜底 */ }
}
function mirror(p: BrowserProfile | null): void {
  try {
    if (p) localStorage.setItem(LEGACY_KEY, JSON.stringify({
      id: p.id, name: p.name, url: p.url, username: p.username, password: p.password,
      authType: p.authType, env: p.env,
    }));
    else localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignore */ }
  try {
    const chrome = (globalThis as any).chrome;
    if (!chrome?.storage?.local) return;
    /* 完整目录 + 激活 id 也镜像给 service worker：后台采样器要遍历所有已存连接，
       而不是只认最后一个单档。 */
    const payload: Record<string, any> = {
      [PROFILES_KEY]: read(),
      [ACTIVE_KEY]: localStorage.getItem(ACTIVE_KEY) || '',
    };
    if (p) payload[LEGACY_KEY] = {
      id: p.id, name: p.name, url: p.url, username: p.username, password: p.password,
      authType: p.authType, env: p.env,
    };
    chrome.storage.local.set(payload);
    if (!p) chrome.storage.local.remove?.(LEGACY_KEY);
  } catch { /* 非扩展环境 */ }
  lastMirroredId = p?.id || '';
}

function ensureMigrated(): void {
  if (migrated) return;
  migrated = true;
  if (read().length) return;
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    const p = norm({ ...(legacy || {}), id: 'browser', name: legacy?.name || hostName(cleanUrl(legacy?.url)) });
    if (p) {
      write([p]);
      localStorage.setItem(ACTIVE_KEY, p.id);
      mirror(p);
    }
  } catch { /* 旧档损坏：当未连接处理 */ }
}

/** 全部本机连接档案（按创建顺序；首次读取自动迁移旧单档）。 */
export function profiles(): BrowserProfile[] {
  ensureMigrated();
  const list = read();
  /* 补齐旧数据缺失 id/name；只在确有变化时回写，避免热路径反复写 localStorage。 */
  let dirty = false;
  for (const p of list) if (!p.id || !p.name) { p.id ||= randomId(); p.name ||= hostName(p.url); dirty = true; }
  if (dirty) write(list);
  /* 浏览器模式的固定身份是 browser：预置 last-user，避免 auth.probe 首轮把本机
     已选目标/草稿当成「换账号」清掉（服务端模式仍由真实用户名驱动清理）。 */
  if (list.length) {
    try {
      if (localStorage.getItem('esquerystudio.last-user') !== 'browser') {
        localStorage.setItem('esquerystudio.last-user', 'browser');
      }
    } catch { /* ignore */ }
  }
  return list;
}

export function profileById(id: string): BrowserProfile | null {
  if (!id) return null;
  return profiles().find(p => p.id === id) || null;
}

/** 当前显式激活的档案（新增/编辑/首连时写入）。 */
export function activeProfile(): BrowserProfile | null {
  const list = profiles();
  if (!list.length) return null;
  const id = localStorage.getItem(ACTIVE_KEY) || '';
  return list.find(p => p.id === id) || list[0];
}

/** 数据面当前目标：顶栏 esquerystudio.target > active。 */
export function dataProfile(): BrowserProfile | null {
  const list = profiles();
  if (!list.length) return null;
  const target = localStorage.getItem(TARGET_KEY) || '';
  const hit = target ? list.find(p => p.id === target) : null;
  if (hit) {
    /* 顶栏切目标后，service worker 的旧单档镜像跟随最后一次数据面选择；
       只在 id 变化时写，避免每请求触碰扩展存储。 */
    if (lastMirroredId !== hit.id) mirror(hit);
    return hit;
  }
  return activeProfile();
}

export function setActiveProfile(id: string): BrowserProfile | null {
  const p = profileById(id);
  if (!p) return null;
  try { localStorage.setItem(ACTIVE_KEY, p.id); } catch { /* ignore */ }
  mirror(p);
  return p;
}

export interface ProfileInput {
  id?: string;
  name?: string;
  url: string;
  username?: string;
  password?: string;
  authType?: string;
  env?: string;
}

/** 新增或更新档案：id 命中=编辑（空密码保留旧密码）；否则新建并激活。 */
export function upsertProfile(input: ProfileInput): BrowserProfile | null {
  const list = profiles();
  const url = cleanUrl(input.url);
  if (!/^https?:\/\/.+/.test(url)) return null;
  const existing = input.id ? list.find(p => p.id === input.id) : null;
  const now = Date.now();
  if (existing) {
    existing.name = String(input.name || existing.name || hostName(url));
    existing.url = url;
    existing.username = input.username === undefined ? existing.username : String(input.username);
    existing.password = input.password == null || input.password === '' ? existing.password : String(input.password);
    existing.authType = input.authType === 'API_KEY' ? 'API_KEY' : (input.authType === 'BASIC' ? 'BASIC' : existing.authType);
    existing.env = input.env || existing.env || 'BROWSER';
    existing.updatedAt = now;
    write(list);
    setActiveProfile(existing.id);
    return existing;
  }
  const p: BrowserProfile = {
    id: randomId(),
    name: String(input.name || hostName(url)),
    url,
    username: input.username == null ? '' : String(input.username),
    password: input.password == null ? '' : String(input.password),
    authType: input.authType === 'API_KEY' ? 'API_KEY' : 'BASIC',
    env: input.env || 'BROWSER',
    createdAt: now,
    updatedAt: now,
  };
  list.push(p);
  write(list);
  setActiveProfile(p.id);
  return p;
}

export function deleteProfile(id: string): boolean {
  const list = profiles();
  const idx = list.findIndex(p => p.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  write(list);
  if (!list.length) {
    try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
    mirror(null);
    return true;
  }
  if (localStorage.getItem(ACTIVE_KEY) === id) setActiveProfile(list[0].id);
  return true;
}

/** 仅测试：清掉模块级迁移/镜像缓存，让 localStorage.clear() 后的用例可重跑迁移。 */
export function __resetBrowserProfilesForTests(): void {
  migrated = false;
  lastMirroredId = '';
}
