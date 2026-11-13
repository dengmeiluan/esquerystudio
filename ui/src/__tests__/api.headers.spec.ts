import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get, post, api, setToken, setTargetId, setHostToken, setAuthSettled } from '../api';

/* R57：R55 P0 的回归防御——request 的 init.headers 必须并入组合头而非整体覆盖。
   那个 bug（...init 在 headers: 之后展开）静默存在了 50+ 轮才被 e2e 逮住，
   一行位置错误让所有显式带头的调用（sqlProbe 等）丢失鉴权头 401。这里锁死契约。
   五百五十七批扩员：授权就绪门行为锁（连接模型开屏竞态根治）。 */

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
});

function sentHeaders(): Record<string, string> {
  return (calls[0].init.headers || {}) as Record<string, string>;
}

describe('api request 头合并（R55 回归防御）', () => {
  it('基础请求带 Content-Type + 鉴权 token', async () => {
    setToken('t-123');
    await get('/cluster/health');
    const h = sentHeaders();
    expect(h['Content-Type']).toBe('application/json');
    expect(h['X-ESQueryStudio-Token']).toBe('t-123');
  });

  it('localStorage target 自动带 X-Es-Target', async () => {
    setToken('t-123');
    setTargetId('conn-qa');
    await get('/cluster/indices');
    expect(sentHeaders()['X-Es-Target']).toBe('conn-qa');
  });

  it('显式 init.headers 并入组合头——不得冲掉鉴权/Content-Type（R55 P0 本体）', async () => {
    setToken('t-123');
    await api.sqlProbe('conn-other');
    const h = sentHeaders();
    // R55 修复前：这两个头会被 init.headers 整体覆盖后丢失 → 401
    expect(h['X-ESQueryStudio-Token']).toBe('t-123');
    expect(h['Content-Type']).toBe('application/json');
    expect(h['X-Es-Target']).toBe('conn-other');
  });

  it('显式头覆盖同名默认头（extraHeaders 优先级最高）', async () => {
    setToken('t-123');
    setTargetId('conn-default');
    await api.sqlProbe('conn-explicit');
    expect(sentHeaders()['X-Es-Target']).toBe('conn-explicit');
  });

  it('init 其余字段（method/body）原样保留', async () => {
    await post('/cluster/sql', { query: 'SELECT 1' });
    expect(calls[0].init.method).toBe('POST');
    /* #86 三轮：原来只断言 body 串里含 'SELECT 1'。把 body 包进伪信封
       （{"wrapped":{"query":"SELECT 1"},"note":"MUT10"}）后该断言仍绿——
       子串出现在任何位置都算数，而后端根本解析不了这个结构。
       本用例名写的是「原样保留」，就该按**原样**判：解析回对象做全等。 */
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ query: 'SELECT 1' });
  });
});

describe('授权就绪门（五百五十七批：连接模型开屏竞态根治）', () => {
  it('宿主令牌在途+门未释放：非豁免请求挂起，release 后才发出', async () => {
    setHostToken('host-t');
    let release!: () => void;
    setAuthSettled(new Promise<void>(r => { release = r; }));
    const p = get('/cluster/indices');
    await new Promise(r => setTimeout(r, 30));
    expect(calls.length).toBe(0); /* 门未开：无裸奔请求（此前开屏竞态=PAGE_DENIED 爆发根因） */
    release();
    await p;
    expect(calls.length).toBe(1);
  });

  it('豁免端点（/auth/me、/clusters）不经门直发——身份/目录自身不得死锁', async () => {
    setHostToken('host-t');
    let release!: () => void;
    setAuthSettled(new Promise<void>(r => { release = r; }));
    await get('/auth/me');
    await get('/clusters');
    expect(calls.length).toBe(2);
    release();
  });

  it('独立部署（无宿主令牌）：门挂起也直通，零回归', async () => {
    let release!: () => void;
    setAuthSettled(new Promise<void>(r => { release = r; }));
    await get('/cluster/indices');
    expect(calls.length).toBe(1);
    release();
  });

  it('4s 兜底：宿主链异常永不 release 时请求放行（不死等）', async () => {
    setHostToken('host-t');
    vi.useFakeTimers();
    try {
      let release!: () => void;
      setAuthSettled(new Promise<void>(r => { release = r; }));
      const p = get('/cluster/indices');
      await vi.advanceTimersByTimeAsync(4100);
      await p;
      expect(calls.length).toBe(1);
      release();
    } finally {
      vi.useRealTimers();
    }
  });
});
