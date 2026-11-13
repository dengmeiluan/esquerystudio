import { describe, it, expect, vi, beforeEach } from 'vitest';
import { post, ApiError } from '../api';

/* R87：请求超时兜底契约——fetch 原生无超时，网络黑洞会让 await 永等（Overview 骨架屏永挂本体）。
   锁死两条语义：① 超时 → 可读 ApiError(408)；② 调用方主动取消 → AbortError 原样上抛（R80 轻提示路径不被污染）。 */

beforeEach(() => {
  localStorage.clear();
  /* 模拟网络黑洞：永不返回，仅响应 abort 信号（含真实 fetch 的「已取消则立即拒绝」语义） */
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      const abortErr = () => {
        const e = new Error('The operation was aborted.');
        e.name = 'AbortError';
        return e;
      };
      if (init.signal!.aborted) { reject(abortErr()); return; }
      init.signal!.addEventListener('abort', () => reject(abortErr()), { once: true });
    })
  ));
});

describe('api 请求超时兜底（R87）', () => {
  it('黑洞请求在 timeoutMs 后抛 ApiError 408，不再永等', async () => {
    const p = post('/cluster/health', undefined, undefined, { timeoutMs: 30 });
    await expect(p).rejects.toBeInstanceOf(ApiError);
    await expect(p).rejects.toMatchObject({ status: 408 });
    await expect(p).rejects.toThrow(/请求超时/);
  });

  it('调用方主动取消依旧抛 AbortError——不得被超时逻辑改写成 408', async () => {
    const ctl = new AbortController();
    const p = post('/cluster/query', '{}', undefined, { signal: ctl.signal, timeoutMs: 5000 });
    setTimeout(() => ctl.abort(), 5);
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('发起前已取消的信号立即生效，不发真实等待', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(post('/cluster/query', '{}', undefined, { signal: ctl.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});
