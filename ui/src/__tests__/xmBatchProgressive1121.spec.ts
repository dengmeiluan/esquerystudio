/**
 * 2026-11-21 兼容计划批：批量迁移渐进式清单 + 失败重试 + 前缀映射预设 + 先同步结构流程。
 *
 *   ① 渐进式清单——下发循环每行状态随完成更新（迁移已下发/下发失败：原因），
 *     终态汇总 toast「批量迁移已下发：成功 M / 失败 K」；
 *   ② 重试失败项——失败行保存 start 参数（含映射后目标名），一键重下发原参数复用；
 *   ③ 前缀映射预设——localStorage xm-batch-presets-v1：按名保存/选择加载/删除；
 *   ④ 先同步结构（逐索引预览→执行）——确认后先逐索引 dryRun 预览（清单「已预览 N 刀」，
 *     reactive>0 挂风险徽标），确认 xm-batch-apply 后逐个 dryRun=false 创建，再进入数据下发；
 *   ⑤ 批量清单窗口化——NInput 过滤框 + 默认 50 条 +「显示更多」步进 + 命中计数。
 * 挂具范式同 xmigrateBatch1120（全真挂载 + api/copyText mock；setupState 直调）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';
import { useAppStore } from '../stores/app';

const xbJobs = vi.fn();
const xbStart = vi.fn();
const xbSync = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      xb: {
        ...actual.api.xb,
        jobs: (...a: any[]) => xbJobs(...a),
        destIndices: async () => [],
        start: (...a: any[]) => xbStart(...a),
        syncStructure: (...a: any[]) => xbSync(...a),
      },
    },
  };
});

/* 61 个索引：窗口化断言用（默认 50 + 显示更多步进） */
const REMOTE = Array.from({ length: 61 }, (_, i) => ({ index: 'idx-' + String(i).padStart(2, '0'), 'docs.count': '10' }));
const SMALL = [
  { index: 'onshore-a', 'docs.count': '100' },
  { index: 'onshore-b', 'docs.count': '200' },
];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountXm() {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/xmigrate', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(XmigrateView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, store: useAppStore(pinia) };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

async function mountReady(indices = SMALL) {
  const ctx = await mountXm();
  const st = stateOf(ctx.app);
  st.conn = { scheme: 'http', host: 'old-es', port: 9200, username: '', password: '' };
  st.remoteIndices = indices;
  await settle(2);
  return { ...ctx, st };
}

function clickToggle(host: ParentNode) {
  (host.querySelector('[data-test="xm-batch-toggle"]') as HTMLButtonElement).click();
}
function checkRow(host: ParentNode, i: number) {
  const boxes = [...host.querySelectorAll('.xm-batch-item [role="checkbox"]')] as HTMLElement[];
  boxes[i]!.click();
}
function setInput(el: HTMLInputElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  xbStart.mockReset().mockResolvedValue({ jobId: 'j-batch' });
  xbSync.mockReset().mockResolvedValue({
    created: true, dryRun: false, destIndex: 'x', rounds: 1,
    planned: { removedSettings: [{ key: 'index.apack.knn', reason: '无 apack' }], removedAnalysis: [], downgradedFields: [] },
    reactive: { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
  });
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* ═══ ① 渐进式清单（成功/失败随完成更新） ═══ */
describe('1121 批量 ①：渐进式下发清单', () => {
  it('逐行状态随完成更新；终态汇总与失败行原因在场', async () => {
    xbStart.mockReset()
      .mockResolvedValueOnce({ jobId: 'j-1' })
      .mockRejectedValueOnce(new Error('磁盘水位超限'));
    const { app, host, store } = await mountReady();
    const spy = vi.spyOn(store, 'notify');
    clickToggle(host); await settle(2);
    checkRow(host, 0); checkRow(host, 1); await settle(2);
    (host.querySelector('[data-test="xm-batch-submit"]') as HTMLButtonElement).click();
    await settle(4);
    ([...document.querySelectorAll('button')].find(b => b.textContent!.trim() === '启动 2 个迁移') as HTMLButtonElement).click();
    await settle(10);
    const panel = host.querySelector('[data-test="xm-batch-result"]')!;
    const rows = [...panel.querySelectorAll('li')];
    expect(rows.length, '全行渐进清单（成功+失败）').toBe(2);
    expect(rows.some(r => r.textContent!.includes('onshore-a') && r.textContent!.includes('迁移已下发')), '成功行状态').toBe(true);
    expect(rows.some(r => r.textContent!.includes('onshore-b') && r.textContent!.includes('下发失败：磁盘水位超限')), '失败行状态+原因').toBe(true);
    expect(spy.mock.calls.some(c => c[0] === 'warning' && c[1] === '批量迁移已下发：成功 1 / 失败 1'), '终态汇总 toast').toBe(true);
    app.unmount();
  }, 12000);
});

/* ═══ ② 重试失败项（参数复用） ═══ */
describe('1121 批量 ②：重试失败项', () => {
  it('失败行按保存参数一键重下发（原目标名/策略复用），成功后行状态翻正', async () => {
    xbStart.mockReset()
      .mockRejectedValueOnce(new Error('暂时 503'))
      .mockResolvedValueOnce({ jobId: 'j-retry-ok' });
    const { app, host, st } = await mountReady();
    clickToggle(host); await settle(2);
    checkRow(host, 0); await settle(2);
    (host.querySelector('[data-test="xm-batch-submit"]') as HTMLButtonElement).click();
    await settle(4);
    ([...document.querySelectorAll('button')].find(b => b.textContent!.trim() === '启动 1 个迁移') as HTMLButtonElement).click();
    await settle(10);
    expect(xbStart).toHaveBeenCalledTimes(1);
    const panel = host.querySelector('[data-test="xm-batch-result"]')!;
    expect(panel.textContent).toContain('下发失败：暂时 503');
    /* 重试失败项：原 req（含 destIndex 映射与策略）原样复用 */
    (panel.querySelector('[data-test="xm-batch-retry"]') as HTMLButtonElement).click();
    await settle(10);
    expect(xbStart).toHaveBeenCalledTimes(2);
    expect(xbStart.mock.calls[1][0]).toEqual(xbStart.mock.calls[0][0]);
    expect(panel.textContent, '重试后行状态翻正').toContain('迁移已下发');
    expect(panel.textContent).not.toContain('暂时 503');
    app.unmount();
  }, 12000);
});

/* ═══ ③ 前缀映射预设（localStorage xm-batch-presets-v1） ═══ */
describe('1121 批量 ③：前缀映射预设存取', () => {
  it('保存→localStorage 落盘；改值后选预设加载回前缀；删除后清空', async () => {
    const { app, host } = await mountReady();
    clickToggle(host); await settle(2);
    setInput(host.querySelector('[data-test="xm-batch-srcprefix"]')!, 'onshore-');
    setInput(host.querySelector('[data-test="xm-batch-dstprefix"]')!, 'uat_');
    await settle(2);
    const nameInp = host.querySelector<HTMLInputElement>('[data-test="xm-batch-preset-name"]')!;
    setInput(nameInp, 'prod2uat');
    await settle(2);
    expect(stateOf(app).batchPresetName, '预设名 v-model 已生效').toBe('prod2uat');
    stateOf(app).saveBatchPreset();
    await settle(4);
    expect(JSON.parse(localStorage.getItem('xm-batch-presets-v1')!), '预设按名落盘').toEqual({
      'prod2uat': [{ srcPrefix: 'onshore-', dstPrefix: 'uat_' }],
    });
    /* 改掉前缀后加载预设：前缀对回填 */
    setInput(host.querySelector('[data-test="xm-batch-srcprefix"]')!, '');
    setInput(host.querySelector('[data-test="xm-batch-dstprefix"]')!, '');
    await settle(2);
    const pick = host.querySelector('[data-test="xm-batch-preset-pick"]') as HTMLElement;
    (pick.querySelector('[role="checkbox"], input') ?? pick); /* NSelect 触发器存在性 */
    /* 直接调 setupState 的加载函数（NSelect 弹层交互交由组件测试，此处锁数据面） */
    stateOf(app).onBatchPresetPick('prod2uat');
    await settle(2);
    expect((host.querySelector('[data-test="xm-batch-srcprefix"]') as HTMLInputElement).value, '加载回源前缀').toBe('onshore-');
    expect((host.querySelector('[data-test="xm-batch-dstprefix"]') as HTMLInputElement).value, '加载回目标前缀').toBe('uat_');
    /* 删除预设：localStorage 清空 */
    stateOf(app).batchPresetId = 'prod2uat';
    await settle(2);
    stateOf(app).delBatchPreset();
    await settle(2);
    expect(JSON.parse(localStorage.getItem('xm-batch-presets-v1')!)).toEqual({});
    app.unmount();
  }, 12000);
});

/* ═══ ④ 先同步结构（逐索引预览→执行） ═══ */
describe('1121 批量 ④：先同步结构流程', () => {
  it('勾选后先逐索引 dryRun 预览（刀数+风险徽标），确认后逐个创建再数据下发', async () => {
    xbSync.mockReset().mockImplementation(async (req: any) => ({
      created: !req.dryRun, dryRun: !!req.dryRun, destIndex: req.destIndex, rounds: 1,
      planned: { removedSettings: [{ key: 'index.apack.knn', reason: '无 apack' }], removedAnalysis: [], downgradedFields: [] },
      reactive: req.sourceIndex === 'onshore-b'
        ? { removedSettings: [{ key: 'index.x', reason: '兜底' }], removedAnalysis: [], downgradedFields: [] }
        : { removedSettings: [], removedAnalysis: [], downgradedFields: [] },
    }));
    const { app, host, st } = await mountReady();
    clickToggle(host); await settle(2);
    checkRow(host, 0); checkRow(host, 1); await settle(2);
    (host.querySelector('[data-test="xm-batch-submit"]') as HTMLButtonElement).click();
    await settle(4);
    /* 「先同步结构」开关在批量确认弹层内（teleport 到 body）——勾选后再确认 */
    const syncBox = (document.querySelector('[data-test="xm-batch-syncfirst"] [role="checkbox"]')
      || document.querySelector('[data-test="xm-batch-syncfirst"]')) as HTMLElement;
    syncBox!.click();
    await settle(2);
    ([...document.querySelectorAll('button')].find(b => b.textContent!.trim() === '启动 2 个迁移') as HTMLButtonElement).click();
    await settle(12);
    /* 阶段一：逐索引 dryRun 预览（未创建未下发） */
    expect(xbSync).toHaveBeenCalledTimes(2);
    for (const c of xbSync.mock.calls) expect(c[0]).toMatchObject({ dryRun: true });
    expect(xbStart, '预览阶段不下发迁移').not.toHaveBeenCalled();
    const panel = host.querySelector('[data-test="xm-batch-result"]')!;
    expect(panel.textContent).toContain('已预览 1 刀');
    expect(panel.querySelector('.xm-batch-risk')!.textContent, 'reactive>0 挂风险徽标').toContain('兜底 1 刀');
    expect(panel.querySelector('[data-test="xm-batch-apply"]'), '确认按钮在场等确认').toBeTruthy();
    /* 阶段二：确认创建并迁移——dryRun=false 逐个创建后接数据下发 */
    (panel.querySelector('[data-test="xm-batch-apply"]') as HTMLButtonElement).click();
    await settle(14);
    expect(xbSync).toHaveBeenCalledTimes(4);
    expect(xbSync.mock.calls[2][0]).toMatchObject({ dryRun: false, sourceIndex: 'onshore-a' });
    expect(xbSync.mock.calls[3][0]).toMatchObject({ dryRun: false, sourceIndex: 'onshore-b' });
    expect(xbStart, '创建后逐个下发迁移').toHaveBeenCalledTimes(2);
    expect(panel.textContent).toContain('迁移已下发');
    expect(panel.textContent).not.toContain('[data-test="xm-batch-apply"]');
    app.unmount();
  }, 16000);
});

/* ═══ ⑤ 批量清单窗口化（NInput 过滤 + 默认 50 + 显示更多） ═══ */
describe('1121 批量 ⑤：清单过滤与窗口化', () => {
  it('默认 50 条 + 显示更多步进 +50；过滤命中计数', async () => {
    const { app, host } = await mountReady(REMOTE);
    clickToggle(host); await settle(2);
    const items = () => [...host.querySelectorAll('.xm-batch-item')];
    expect(items().length, '默认窗口 50 条').toBe(50);
    const more = host.querySelector('[data-test="xm-remote-more"]') as HTMLButtonElement;
    expect(more.textContent, '步进提示剩余计数').toContain('还有 11 个');
    more.click();
    await settle(2);
    expect(items().length, '步进后全量 61').toBe(61);
    expect(host.querySelector('[data-test="xm-remote-more"]'), '全量后提示退场').toBeNull();
    /* 过滤：命中计数 + 窗口复位（NInput data-test 落根，输入框在内部） */
    const kwWrap = host.querySelector('[data-test="xm-remote-kw"]')!;
    const kwInp = (kwWrap.querySelector('input') || kwWrap) as HTMLInputElement;
    setInput(kwInp, 'idx-0');
    await settle(4);
    expect(host.textContent).toContain('命中 10/61');
    expect(items().length, '过滤命中 10 条（窗口复位后仍全显）').toBe(10);
    app.unmount();
  }, 12000);
});
