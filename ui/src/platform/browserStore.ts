/* 纯浏览器模式的本机持久层：IndexedDB 为主，内存兜底。
 * 服务端用 ES 环形索引存监控/审计；插件没有服务端，就把同口径的数据留在本机，
 * 页面仍走同一套 api.ts 契约。数据只在本机扩展 origin 内，不上传。 */

const DB_NAME = 'esquerystudio.browser';
const DB_VERSION = 1;
export const STORE_MONITOR = 'monitor';
export const STORE_ALERTS = 'alerts';
export const STORE_AUDIT = 'audit';
export const STORE_META = 'meta';

const memory = new Map<string, any[]>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_MONITOR)) db.createObjectStore(STORE_MONITOR, { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains(STORE_ALERTS)) db.createObjectStore(STORE_ALERTS, { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains(STORE_AUDIT)) db.createObjectStore(STORE_AUDIT, { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

function mem(store: string): any[] {
  if (!memory.has(store)) memory.set(store, []);
  return memory.get(store)!;
}

export async function dbAdd(store: string, value: any): Promise<void> {
  const db = await openDb();
  if (!db) { mem(store).push({ ...value }); return; }
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).add(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

export async function dbAll<T = any>(store: string): Promise<T[]> {
  const db = await openDb();
  if (!db) return [...mem(store)] as T[];
  return new Promise<T[]>(resolve => {
    try {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve((req.result || []) as T[]);
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

export async function dbDeleteMany(store: string, keys: any[]): Promise<void> {
  if (!keys.length) return;
  const db = await openDb();
  if (!db) { memory.set(store, mem(store).filter(x => !keys.includes(x.id))); return; }
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      for (const k of keys) os.delete(k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

export async function dbClear(store: string): Promise<void> {  const db = await openDb();
  if (!db) { memory.set(store, []); return; }
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

export async function metaGet<T = any>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) {
    const hit = mem(STORE_META).find(x => x.key === key);
    return hit ? hit.value as T : null;
  }
  return new Promise<T | null>(resolve => {
    try {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value as T : null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function metaSet(key: string, value: any): Promise<void> {
  const db = await openDb();
  if (!db) {
    const arr = mem(STORE_META);
    const i = arr.findIndex(x => x.key === key);
    if (i >= 0) arr[i] = { key, value }; else arr.push({ key, value });
    return;
  }
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}
