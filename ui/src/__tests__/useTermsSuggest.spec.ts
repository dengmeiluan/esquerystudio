import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import { useAppStore } from '../stores/app';

const searchRawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api,
    searchRaw: (...a: any[]) => searchRawFn(...a),
    clusterIndices: () => Promise.resolve([]), overview: () => Promise.resolve({}),
    clusterHealth: () => Promise.resolve({}),
    setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
  } };
});
import { useTermsSuggest, __clearSuggestCache } from '../composables/useTermsSuggest';

const apps: App[] = [];
function withSetup(index: () => string) {
  /* 在组件 setup 上下文里跑 composable（pinia 激活）；store 一并暴露供切 target 用 */
  let out!: ReturnType<typeof useTermsSuggest>;
  let store!: ReturnType<typeof useAppStore>;
  const Comp = defineComponent({ setup() { out = useTermsSuggest(index); store = useAppStore(); return () => h('div'); } });
  const app = createApp(Comp);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  return { ...out, store };
}

function aggResp(...keys: string[]) {
  return { aggregations: { suggest: { buckets: keys.map(k => ({ key: k })) } } };
}

beforeEach(() => {
  document.body.innerHTML = '';
  __clearSuggestCache();
  searchRawFn.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  while (apps.length) apps.pop()!.unmount();
});

describe('useTermsSuggest', () => {
  it('① 请求体：terms agg 打向指定 field，size:0 + include 前缀通配', async () => {
    searchRawFn.mockResolvedValue(aggResp('active', 'audit'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'a');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    const [idx, bodyStr] = searchRawFn.mock.calls[0] as [string, string];
    expect(idx).toBe('logs-x');
    const body = JSON.parse(bodyStr);
    expect(body.size).toBe(0);
    expect(body.aggs.suggest.terms.field).toBe('status');
    expect(body.aggs.suggest.terms.include).toBe('a.*');
    expect(out.suggestions.value).toEqual(['active', 'audit']);
    expect(out.suggesting.value).toBe(false);
  });

  it('② 300ms 防抖：连续 3 次调用只发 1 次请求（取最后一次 prefix）', async () => {
    searchRawFn.mockResolvedValue(aggResp('abc-1'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'a');
    await vi.advanceTimersByTimeAsync(100);
    out.suggest('status', 'ab');
    await vi.advanceTimersByTimeAsync(100);
    out.suggest('status', 'abc');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    const body = JSON.parse((searchRawFn.mock.calls[0] as [string, string])[1]);
    expect(body.aggs.suggest.terms.include).toBe('abc.*');
  });

  it('③ 序号守卫：A 在飞时发 B，A 后回被丢弃（结果=B）', async () => {
    const resolvers: Array<(v: any) => void> = [];
    searchRawFn.mockImplementation(() => new Promise(res => resolvers.push(res)));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'a');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    out.suggest('status', 'ab');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(2);
    /* B 先回：生效 */
    resolvers[1](aggResp('b-val'));
    await vi.advanceTimersByTimeAsync(0);
    expect(out.suggestions.value).toEqual(['b-val']);
    /* A 后回：序号过期，丢弃不覆盖 */
    resolvers[0](aggResp('a-val'));
    await vi.advanceTimersByTimeAsync(0);
    expect(out.suggestions.value).toEqual(['b-val']);
  });

  it('④ 失败静默：suggestions 置空、suggesting 复位、不 throw', async () => {
    searchRawFn.mockRejectedValueOnce(new Error('boom'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'x');
    await vi.advanceTimersByTimeAsync(300);
    expect(out.suggestions.value).toEqual([]);
    expect(out.suggesting.value).toBe(false);
  });

  it('⑤ 同 field+prefix 5 分钟内命中缓存零请求；过期后重拉', async () => {
    searchRawFn.mockResolvedValue(aggResp('err-1'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'err');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    expect(out.suggestions.value).toEqual(['err-1']);
    /* 5 分钟内同 key：缓存命中 */
    out.suggest('status', 'err');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    expect(out.suggestions.value).toEqual(['err-1']);
    /* 前进 6 分钟：缓存过期，重新请求 */
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    out.suggest('status', 'err');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(2);
  });

  it('⑥ 缓存命中复位 suggesting：B 在飞时命中已缓存 key，suggesting 不卡 true', async () => {
    /* 先入缓存：status|err */
    searchRawFn.mockResolvedValueOnce(aggResp('err-1'));
    /* 后续请求 pending 不 resolve（模拟 B 在飞） */
    searchRawFn.mockImplementation(() => new Promise(() => {}));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'err');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    expect(out.suggestions.value).toEqual(['err-1']);
    /* 触发 B（另一 key）：suggesting=true 且永不返回 */
    out.suggest('status', 'other');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(2);
    expect(out.suggesting.value).toBe(true);
    /* 返回已缓存 key：命中即完成，suggesting 复位；B 后回也会被序号守卫丢弃 */
    out.suggest('status', 'err');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(2);
    expect(out.suggesting.value).toBe(false);
    expect(out.suggestions.value).toEqual(['err-1']);
  });

  it('⑦ F1 prefix 含 Lucene RegExp 元字符：include 转义（1.2 → 1\\.2.*）', async () => {
    searchRawFn.mockResolvedValue(aggResp('1.2.3'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', '1.2');
    await vi.advanceTimersByTimeAsync(300);
    const body = JSON.parse((searchRawFn.mock.calls[0] as [string, string])[1]);
    expect(body.aggs.suggest.terms.include).toBe('1\\.2.*');
  });

  it('⑧ F1 空前缀：body 整体省略 include 子句', async () => {
    searchRawFn.mockResolvedValue(aggResp('top1'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', '');
    await vi.advanceTimersByTimeAsync(300);
    const body = JSON.parse((searchRawFn.mock.calls[0] as [string, string])[1]);
    expect(body.aggs.suggest.terms.field).toBe('status');
    expect(body.aggs.suggest.terms.size).toBe(20);
    expect(body.aggs.suggest.terms).not.toHaveProperty('include');
  });

  it('⑨ F2 空字段早退：在飞请求中触发，suggesting 复位且不新发请求', async () => {
    /* A 永不返回（在飞） */
    searchRawFn.mockImplementation(() => new Promise(() => {}));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'a');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    expect(out.suggesting.value).toBe(true);
    /* 空字段调用：最新 seq，早退分支复位 suggesting */
    out.suggest('', 'a');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    expect(out.suggesting.value).toBe(false);
    expect(out.suggestions.value).toEqual([]);
  });

  it('⑩ F3 onScopeDispose：防抖未发即 unmount，定时器被清、零请求', async () => {
    searchRawFn.mockResolvedValue(aggResp('x'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'a');
    apps.pop()!.unmount();
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).not.toHaveBeenCalled();
  });

  it('⑪ F4 缓存上界：>200 触发 prune，先清过期、再超逐最旧', async () => {
    searchRawFn.mockResolvedValue(aggResp('v'));
    const out = withSetup(() => 'logs-x');
    const t0 = Date.now();
    const fill = async (tag: string, n: number) => {
      for (let i = 0; i < n; i++) { out.suggest('status', tag + i); await vi.advanceTimersByTimeAsync(300); }
    };
    /* 150 条旧 entry（T0 时刻插入） */
    await fill('p', 150);
    expect(searchRawFn).toHaveBeenCalledTimes(150);
    /* 前进 6 分钟：p* 全部过期但仍在缓存 */
    vi.setSystemTime(t0 + 6 * 60 * 1000);
    /* 51 条新 entry → size=201（均未触发 prune：set 前 size ≤ 200） */
    await fill('q', 51);
    expect(searchRawFn).toHaveBeenCalledTimes(201);
    /* 再入 1 条：set 前 size=201>200 → prune 清掉 150 条过期 → 51 + 1 = 52 */
    out.suggest('status', 'zzz');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(202);
    /* 续填 149 条：若过期项未被清（size 在 201 徘徊），最早的 q0 会被逐出；
       prune 生效则 size=52 起步填到 201，期间不触发逐出，q0 仍缓存 */
    await fill('r', 149);
    expect(searchRawFn).toHaveBeenCalledTimes(351);
    out.suggest('status', 'q0');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(351); /* q0 命中：证明 prune 清的是过期项 */
    /* 再超 1 条：无过期可清 → 逐最旧（q0 被逐出，重查需重新请求） */
    out.suggest('status', 's0');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(352);
    out.suggest('status', 'q0');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(353);
  });

  it('⑫ F5 切集群目标：清本实例 suggestions/suggesting（缓存 key 含 target 不动）', async () => {
    searchRawFn.mockResolvedValue(aggResp('a1'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'a');
    await vi.advanceTimersByTimeAsync(300);
    expect(out.suggestions.value).toEqual(['a1']);
    out.store.target = 'conn-1';
    await nextTick();
    expect(out.suggestions.value).toEqual([]);
    expect(out.suggesting.value).toBe(false);
  });

  it('⑬ 失败清空旧值：先成功后失败 → suggestions 清空（语义保留）', async () => {
    searchRawFn.mockResolvedValueOnce(aggResp('ok-1'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'a');
    await vi.advanceTimersByTimeAsync(300);
    expect(out.suggestions.value).toEqual(['ok-1']);
    searchRawFn.mockRejectedValueOnce(new Error('boom'));
    out.suggest('status', 'ab');
    await vi.advanceTimersByTimeAsync(300);
    expect(out.suggestions.value, '上次成功这次失败仍必须清空旧值').toEqual([]);
    expect(out.suggesting.value).toBe(false);
  });

  it('⑭ 连续失败不赋新引用：suggestions 引用保持不变（切断 watch→refresh→suggest 重试循环根因）', async () => {
    searchRawFn.mockRejectedValue(new Error('boom'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'a');
    await vi.advanceTimersByTimeAsync(300);
    expect(out.suggestions.value).toEqual([]);
    const ref1 = out.suggestions.value;
    out.suggest('status', 'ab');
    await vi.advanceTimersByTimeAsync(300);
    expect(out.suggestions.value, '连续失败不许赋新引用（新引用会触发消费侧 watch 再 suggest）').toBe(ref1);
  });
});
