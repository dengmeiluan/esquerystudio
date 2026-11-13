/**
 * 产线 404 回归：uiConfig 曾把 `${EP}/ui/config` 交给默认 base=EP 的 get()，
 * 实际 URL 变成 `{ctx}/internal/es/index{ctx}/internal/es/index/ui/config`，
 * 平台品牌与功能包裁剪永远静默回落「全开」。此处锁接线：path 必须是相对的。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({ EP: '/internal/es/index', get: vi.fn() }));

import { get } from '../api';
import { createPinia, setActivePinia } from 'pinia';
import { useUiConfigStore } from '../stores/uiConfig';

describe('uiConfig 配置请求接线', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('只请求相对 /ui/config（EP 由 api.get 拼一次）', async () => {
    (get as any).mockResolvedValue({ product: { name: 'Acme Search', integrationId: 'acme' }, packs: [] });
    const store = useUiConfigStore();
    await store.load();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/ui/config');
    expect(store.product.name).toBe('Acme Search');
    expect(store.failed).toBe(false);
  });

  it('配置端点失败仍回落全开（既有降级语义不回归）', async () => {
    (get as any).mockRejectedValue(new Error('404'));
    const store = useUiConfigStore();
    await store.load();
    expect(store.loaded).toBe(true);
    expect(store.failed).toBe(true);
    expect(store.product.name).toBe('ESQueryStudio');
    expect(store.pageEnabled('search')).toBe(true);
  });
});
