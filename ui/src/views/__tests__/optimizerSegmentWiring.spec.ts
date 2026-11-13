/**
 * R101 接线守卫：优化向导必须**真的**把 `_cat/indices` 的段数喂给 `evaluateSegments`。
 *
 * <b>为什么单靠 segmentAdvice.spec.ts 不够</b>：那个文件直接调纯函数
 * `evaluateSegments({segmentsCount, priShards, ...})`，把数据当参数喂进去。
 * 实测把视图里 `segAdvice` 的计算属性改成恒返 `null`（等价于「段体检这块功能静默消失」）后，
 * 全量 **799 条测试全绿** —— 纯函数写得再对，视图不调用它就等于这次改造没做，
 * 而没有任何测试会察觉。这个失效模式在本项目已重复出现过三次
 * （R99 的 useNow、passMessage(true)、DesiredStatePayload.of(..., null)）。
 *
 * 断言取**派生值** `21.8` 而不是原始值 `218`：
 * 218 是 `_cat` 原样透传的段总数，视图不接线它照样显示；
 * 而 21.8 = 218 / (rep+1) / pri 只可能来自 `evaluateSegments` 的计算，
 * 无法蒙对。这是本条唯一有判定力的锚点。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 取自真集群：qa_sentiment_news_published 的实测值（5 主 / 1 副 / 218 段 / 9.4gb / deleted 0） */
const PHYSICAL = 'qa_sentiment_news_published_adhoc_20260730155649';
const CAT_ROW = {
  index: PHYSICAL,
  health: 'green',
  status: 'open',
  'docs.count': '8332985',
  'store.size': '9.4gb',
  pri: '5',
  rep: '1',
  'creation.date.string': '2026-07-30T15:56:49.000Z',
  'segments.count': '218',
  'docs.deleted': '0',
};

const clusterIndicesFn = vi.fn(async () => [CAT_ROW] as any[]);

/* 五百八十二批随迁（mock 债归因）：①视图静态 import RawIoModal→MonacoEditor→monaco 巨图，
   首用例冷 transform 超 5s=前置用例假超时（572 批 SqlConsole 8.4s 同款）——组件级 mock 斩链；
   ②视图挂载/扫描链的其余网络出口补 mock 堵真 fetch 挂起（照 useCurrentIdxWritePages525 全集） */
vi.mock('../../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
    template: '<div class="monaco-stub"></div>',
  },
}));

/* 只替换网络出口，其余（视图 / 纯函数 / 子组件）全用真的 */
vi.mock('../../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      indexSettings: vi.fn(async () => ({
        [PHYSICAL]: { settings: { index: { number_of_shards: '5', number_of_replicas: '1', refresh_interval: '10s', codec: 'zstandard' } } },
      })),
      clusterHealth: vi.fn(async () => ({ number_of_data_nodes: 3 })),
      clusterIndices: clusterIndicesFn,
      keys: vi.fn(async () => []),
      /* 五百八十二批补缺口（照 useCurrentIdxWritePages525 全集）：挂载链其余出口挡真实 fetch */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      clustersList: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
      setup: { ...orig.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

async function mountOptimizer() {
  const { createApp, h, nextTick } = await import('vue');
  const { createPinia, setActivePinia } = await import('pinia');
  const { useAppStore } = await import('../../stores/app');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const View = (await import('../IndexOptimizerView.vue')).default;

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();

  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(View) });
  const pinia = createPinia();
  setActivePinia(pinia);
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();

  const settle = async () => { await new Promise(r => setTimeout(r, 40)); await nextTick(); };

  /** 五百八十二批退役改写（572-C2/573 件 D 范式）：.ixp-inp 手填框随 532 批物理退役——
   *  target 流转=store.pick → 点「用当前索引」显式桥（[data-test="use-current-idx"]）
   *  → 扫描钮 disabled 翻转（:disabled="!target || loading"）→ 显式点击扫描。 */
  const scan = async (name = PHYSICAL) => {
    const store = useAppStore();
    store.pick(name);
    await settle();
    const bridge = host.querySelector<HTMLButtonElement>('[data-test="use-current-idx"]');
    bridge?.click();
    await settle();
    const btn = [...host.querySelectorAll('button')]
      .find(b => /扫描|体检|分析/.test(b.textContent || '')) as HTMLButtonElement | undefined;
    if (btn && !btn.disabled) {
      btn.click();
      await settle();
      await settle();
      return true;
    }
    return false;
  };

  return { host, scan, statsText: () => (host.querySelector('.io-seg-stats') as HTMLElement | null)?.textContent || '' };
}

beforeEach(() => {
  document.body.innerHTML = '';
  clusterIndicesFn.mockClear();
});

describe('R101 优化向导段数接线', () => {
  /* 到位判据独立于核心断言：否则「没走到扫描」与「扫描了但没接线」会混成同一条红。 */
  it('前置：显式桥写入目标索引并点扫描后，视图确实拉了 _cat/indices（582 随迁 532 退役形态）', async () => {
    const { scan } = await mountOptimizer();
    const ok = await scan();
    expect(ok, '扫描钮经显式桥写入 target 后必须可用并被点击').toBe(true);

    expect(clusterIndicesFn).toHaveBeenCalled();
  });

  /**
   * 核心判据：段体检面板必须出现，且显示的是**派生**的每主分片段数 21.8。
   * 218 / (1+1) / 5 = 21.8 —— 只可能来自 evaluateSegments，视图不接线时这块整体不渲染。
   */
  it('段体检面板显示派生的每主分片段数（掐断接线时本条必须红）', async () => {
    const { host, scan, statsText } = await mountOptimizer();
    await scan();

    expect(host.querySelector('.io-seg-stats')).not.toBeNull();
    expect(statsText()).toContain('21.8');
  });

  /** 关闭的索引 segments.count 为空 —— 必须静默不出这块，不许瞎报 0 段。 */
  it('segments.count 缺失时整块不渲染，不瞎报', async () => {
    /* 五百八十二批：挂载期 onMounted 也会消耗一次 clusterIndices（Once 语义被吃掉）——
       改常驻实现并在用例尾还原（挂载前即生效，扫描调用稳定拿到空段行） */
    const prev = clusterIndicesFn.getMockImplementation();
    clusterIndicesFn.mockImplementation(async () => [{ ...CAT_ROW, 'segments.count': '', 'docs.deleted': '' }]);
    try {
      const { host, scan } = await mountOptimizer();
      await scan();

      expect(host.querySelector('.io-seg-stats')).toBeNull();
    } finally {
      clusterIndicesFn.mockImplementation(prev ?? (async () => [CAT_ROW] as any[]));
    }
  });
});
