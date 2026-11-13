import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { useAppStore } from '../stores/app';

const mappingDetailFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api,
    mappingDetail: (...a: any[]) => mappingDetailFn(...a),
    clusterIndices: () => Promise.resolve([]), overview: () => Promise.resolve({}),
    clusterHealth: () => Promise.resolve({}),
    setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
  } };
});
import { useIndexFields, __clearFieldCache } from '../composables/useIndexFields';

const MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  message: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  user: { properties: { name: { type: 'text' }, age: { type: 'integer' } } },
} } };

function withSetup(fn: () => ReturnType<typeof useIndexFields>) {
  /* 在组件 setup 上下文里跑 composable（pinia 激活） */
  let out!: ReturnType<typeof useIndexFields>;
  const Comp = defineComponent({ setup() { out = fn(); return () => h('div'); } });
  const app = createApp(Comp);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  return { out, app };
}

beforeEach(() => { document.body.innerHTML = ''; __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue(MAPPING); });

describe('useIndexFields', () => {
  it('拍平 mapping：嵌套 properties + multi-fields，按 path 排序', async () => {
    const { out, app } = withSetup(() => useIndexFields(() => 'logs-2026.08'));
    await out.ensure();
    const paths = out.fields.value.map(f => f.path);
    expect(paths).toEqual(['message', 'message.keyword', 'status', 'user', 'user.age', 'user.name']);
    expect(out.fields.value.find(f => f.path === 'user')!.type).toBe('object');
    app.unmount();
  });
  it('同 key 二次 ensure 命中缓存零请求；index 变化换 key 重拉', async () => {
    /* 按索引返回不同 mapping：防串 key 假绿——换索引后 fields 内容必须跟随切换 */
    mappingDetailFn.mockImplementation((index: string) => Promise.resolve(
      index === 'a-idx'
        ? { raw: { properties: { alpha: { type: 'keyword' } } } }
        : { raw: { properties: { beta: { type: 'text' } } } }));
    const idx = { v: 'a-idx' };
    const { out, app } = withSetup(() => useIndexFields(() => idx.v));
    await out.ensure();
    const aPaths = out.fields.value.map(f => f.path);
    expect(aPaths).toEqual(['alpha']);
    await out.ensure();
    expect(mappingDetailFn).toHaveBeenCalledTimes(1);
    /* 缓存命中的第二次 ensure：fields 仍非空且内容不变 */
    expect(out.fields.value.length).toBeGreaterThan(0);
    expect(out.fields.value.map(f => f.path)).toEqual(aPaths);
    idx.v = 'b-idx'; await out.ensure();
    expect(mappingDetailFn).toHaveBeenCalledTimes(2);
    const bPaths = out.fields.value.map(f => f.path);
    expect(bPaths).toContain('beta');
    expect(bPaths).not.toContain('alpha');
    app.unmount();
  });
  it('拉取失败：loadErr 置位、fields 空、reload 可恢复（零降级）', async () => {
    mappingDetailFn.mockRejectedValueOnce(new Error('boom'));
    const { out, app } = withSetup(() => useIndexFields(() => 'x'));
    await out.ensure();
    expect(out.loadErr.value).toContain('boom');
    expect(out.fields.value).toEqual([]);
    await out.reload();
    expect(out.loadErr.value).toBe('');
    expect(out.fields.value.length).toBeGreaterThan(0);
    app.unmount();
  });
  it('切集群目标：watch(store.target) 失效锁定，fields/loadErr 清空', async () => {
    let store!: ReturnType<typeof useAppStore>;
    const { out, app } = withSetup(() => {
      store = useAppStore();
      return useIndexFields(() => 'logs-2026.08');
    });
    /* 先制造真实错误态：loadErr 非空（mockRejectedValueOnce 后自动恢复 resolved 的既有范式） */
    mappingDetailFn.mockRejectedValueOnce(new Error('boom'));
    await out.ensure();
    expect(out.loadErr.value).toContain('boom');
    expect(out.fields.value).toEqual([]);
    store.target = 'other';
    await nextTick();
    expect(out.fields.value).toEqual([]);
    expect(out.loadErr.value).toBe('');
    app.unmount();
  });
});
