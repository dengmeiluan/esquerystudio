/**
 * 托管重建重跑弹层：参数预设（2026-11-22 能力栈批，localStorage ar-rebuild-presets）。
 *
 *  · 保存：当前 rps/slices/batchSize 三项组合按名落盘（writeStoredRaw 单源写通道，
 *    XmigrateView xm-batch-presets 同模式、同款 key 命名风格）；
 *  · 应用：选中预设回填三输入（NSelect 弹层交互交由组件测试，此处 setupState 直调
 *    锁数据面——xmBatchProgressive1121 ③ 同先例）；
 *  · 删除：删除选中预设并落盘；
 *  · 持久：重新挂载（新 app）后预设仍可读（坏 JSON 静默丢弃不炸页面）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const statusFn = vi.fn();
const jobsFn = vi.fn();
const eventsFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      adhoc: {
        ...actual.api.adhoc,
        status: (...a: any[]) => statusFn(...a),
        jobs: (...a: any[]) => jobsFn(...a),
        events: (...a: any[]) => eventsFn(...a),
      },
    },
  };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { void props; void emit; return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import AdhocRebuildView from '../views/AdhocRebuildView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const failedJob = (over: Record<string, any> = {}) => ({
  jobId: 'ap-1', logicalName: 'bond_index', aliasMode: true, strategy: 'WRITE_BLOCK',
  timeField: null, status: 'FAILED', stage: 'FULL_REINDEX', startedAt: 1700000000000,
  finishedAt: 1700000009000, sourcePhysical: 'bond_v1', destPhysical: 'bond_v2',
  error: '全量中途失败', currentTaskId: null,
  requestsPerSecond: 100, slices: 2, batchSize: 500,
  ...over,
});

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

async function mountAR(job: any) {
  jobsFn.mockResolvedValue([job]);
  statusFn.mockResolvedValue(job);
  eventsFn.mockResolvedValue({ events: [] });
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/search', component: { template: '<div/>' } },
      { path: '/indices', component: { template: '<div/>' } },
      { path: '/tasks', component: { template: '<div/>' } },
      { path: '/aliases', component: { template: '<div/>' } },
      { path: '/health-report', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(AdhocRebuildView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle(20);
  /* 进监控步开重跑弹层（预设行在弹层内） */
  const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
  const row = rows.find(tr => (tr.textContent || '').includes(job.jobId));
  (row!.querySelector('button[aria-label="查看任务详情"]') as HTMLButtonElement).click();
  await settle(10);
  (host.querySelector<HTMLButtonElement>('[data-test="adhoc-retry"]'))!.click();
  await settle(8);
  return { app, host };
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('源码锁：预设存储通道与弹层入口', () => {
  const src = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');

  it('localStorage key ar-rebuild-presets + writeStoredRaw 单源写通道（无裸写）', () => {
    expect(src).toContain("const AR_PRESETS_KEY = 'ar-rebuild-presets'");
    expect(src).toMatch(/writeStoredRaw\(localStorage, AR_PRESETS_KEY, JSON\.stringify\(arPresets\.value\)\)/);
    /* G3 裸写禁令：预设面不得出现裸 setItem */
    expect(src).not.toMatch(/localStorage\.setItem\(/);
  });

  it('弹层内预设行：NSelect 选 + 原生文本框命名 + 保存/删除两钮', () => {
    expect(src).toMatch(/<n-select v-model:value="arPresetId"[\s\S]{0,240}data-test="ar-preset-pick"/);
    expect(src).toContain('data-test="ar-preset-name"');
    expect(src).toContain('data-test="ar-preset-save"');
    expect(src).toContain('data-test="ar-preset-del"');
  });
});

describe('行为：存 / 取 / 删 / 应用 / 持久', () => {
  it('保存当前三项组合 → localStorage 落盘；应用回填三输入；删除清空', { timeout: 20000 }, async () => {
    const { app, host } = await mountAR(failedJob());
    const st = stateOf(app);
    /* 弹层已开（预填原值 rps=100/slices=2/batch=500）——改成新组合保存 */
    st.retryRps = 500;
    st.retrySlices = 4;
    st.retryBatch = 2000;
    await settle(2);
    st.arPresetName = '夜间全速';
    await settle(2);
    expect(document.querySelector('[data-test="ar-preset-name"]'), '预设行在弹层内').toBeTruthy();
    st.saveArPreset();
    await settle(4);
    expect(JSON.parse(localStorage.getItem('ar-rebuild-presets')!), '三项组合按名落盘').toEqual({
      '夜间全速': { rps: 500, slices: 4, batch: 2000 },
    });
    expect(st.arPresetId, '保存后选中态指向该预设').toBe('夜间全速');

    /* 改掉三输入后应用预设：回填保存时组合 */
    st.retryRps = null;
    st.retrySlices = null;
    st.retryBatch = null;
    await settle(2);
    st.applyArPreset('夜间全速');
    await settle(2);
    expect(st.retryRps).toBe(500);
    expect(st.retrySlices).toBe(4);
    expect(st.retryBatch).toBe(2000);

    /* 删除预设：localStorage 清空、选中态复位 */
    st.delArPreset();
    await settle(4);
    expect(JSON.parse(localStorage.getItem('ar-rebuild-presets')!)).toEqual({});
    expect(st.arPresetId).toBeNull();
    expect(st.arPresetOpts, '下拉选项随删随清').toEqual([]);
    void host;
  });

  it('重挂载后预设仍可读（持久化）；坏 JSON 静默丢弃不炸页面', { timeout: 20000 }, async () => {
    localStorage.setItem('ar-rebuild-presets', JSON.stringify({
      '日间稳态': { rps: 200, slices: 2, batch: 1000 },
    }));
    const { app } = await mountAR(failedJob());
    const st = stateOf(app);
    expect(st.arPresetOpts, '重挂载读到既有预设').toEqual([{ label: '日间稳态', value: '日间稳态' }]);

    /* 应用跨会话预设：回填链路同源 */
    st.applyArPreset('日间稳态');
    await settle(2);
    expect(st.retryRps).toBe(200);
    expect(st.retryBatch).toBe(1000);

    /* 坏 JSON：读侧静默丢弃（最坏=预设列表空，不炸页面） */
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    localStorage.setItem('ar-rebuild-presets', '{oops');
    const second = await mountAR(failedJob());
    const st2 = stateOf(second.app);
    expect(st2.arPresetOpts, '坏快照静默丢弃').toEqual([]);
  });

  it('空名保存被拦（warning，不落盘）', { timeout: 20000 }, async () => {
    const { app } = await mountAR(failedJob());
    const st = stateOf(app);
    st.arPresetName = '   ';
    await settle(2);
    st.saveArPreset();
    await settle(4);
    expect(localStorage.getItem('ar-rebuild-presets'), '空名不落盘').toBeNull();
  });
});
