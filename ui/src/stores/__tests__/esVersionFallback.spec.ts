import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

/* 五百六十批：版本识别回落契约——弃 raw 透传改 clusterHealth.version。
 * 用户实报「只是打开页面就出现高危操作」：raw 是 ADMIN 域端点，版本探测每次开屏
 * 落一条 HIGH_RISK「raw=GET /」刷审计流水。本 spec 双向锁：回落吃 health.version，
 * 且 raw 永不被版本链路调用（旧实现跑本 spec 两断言双红）。 */

const rawSpy = vi.fn(() => Promise.resolve({ body: { version: { number: '9.9.9' } } }));
const healthFn = vi.fn((): Promise<any> => Promise.resolve({ status: 'green', version: '7.10.1' }));

vi.mock('../../api', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterHealth: () => healthFn(),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      raw: () => rawSpy(),
    },
  };
});

import { useAppStore } from '../app';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  rawSpy.mockClear();
  healthFn.mockClear();
});

describe('版本识别回落（五百六十批）', () => {
  it('宿主目标回落 clusterHealth().version，不再走 raw 透传', async () => {
    const store = useAppStore();
    await store.loadIndices();
    await vi.waitFor(() => expect(store.esVersion).toBe('7.10.1'));
    expect(rawSpy).not.toHaveBeenCalled();
  });

  it('health 无 version 字段时静默留空（版本识别失败不扰民）', async () => {
    healthFn.mockResolvedValueOnce({ status: 'yellow' });
    const store = useAppStore();
    await store.loadIndices();
    await new Promise(r => setTimeout(r, 20));
    expect(store.esVersion).toBe('');
    expect(rawSpy).not.toHaveBeenCalled();
  });
});
