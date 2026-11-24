/* 五百四十七批 W5（轨5 全栈）：errMeta 铺装二视图——DiagView / TaskTreeView 错误面改用
 * errPreHtml+errMeta 双参（范式先例：BoostTuner/MatchMatrix 等 534 收口波 15 视图；
 * errMeta 帮手契约见 errEndpoint534）。要求：
 *  ① friendlyEsError 通道与原错误文案语义不回退——错误原文全文仍在，仅头部追加
 *     code 徽标 /「失败于 端点」元信息行；
 *  ② catch 压串丢 code/endpoint 的点改透传原始对象（runErrRaw 旁路范式）；
 *  ③ 旧后端兼容：errMeta 空 meta 时 errPreHtml 输出与单参逐字一致（无则不显）。
 * DiagView 双源聚合面（health/clusterHealth、nodesStats/pendingTasks）取首个带元信息的
 * 错误喂 errMeta（firstMetaRaw），单面（TaskTreeView load）直接旁路原始对象。
 * 锁法：源码锚（errMeta 在场 + 原始对象旁路在场）+ 挂载行为锁（ApiError 出元信息行、
 * 普通 Error 不出——两视图均可挂载，happy-dom 真挂）。 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const diagSrc = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');
const ttSrc = readFileSync(join(__dirname, '../views/TaskTreeView.vue'), 'utf-8');

/* ── 挂载桩（clusterThreeState 同款：只换网络出口，视图全真） ── */
const tasksFn = vi.fn();
const healthFn = vi.fn();
const clusterHealthFn = vi.fn();
const nodesStatsFn = vi.fn();
const pendingTasksFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterTasks: (...args: any[]) => tasksFn(...args),
      health: (...args: any[]) => healthFn(...args),
      clusterHealth: (...args: any[]) => clusterHealthFn(...args),
      nodesStats: (...args: any[]) => nodesStatsFn(...args),
      pendingTasks: (...args: any[]) => pendingTasksFn(...args),
    },
  };
});

import TaskTreeView from '../views/TaskTreeView.vue';
import DiagView from '../views/DiagView.vue';
import { ApiError } from '../api';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView(comp: any) {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle();
  return { app, host };
}

beforeEach(() => {
  vi.clearAllMocks();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.querySelectorAll('.err-bar').forEach(e => e.remove());
});

describe('五百四十七批：errMeta 铺装源码锚（errPreHtml+errMeta 双参 + 原始对象旁路在场）', () => {
  it('DiagView：双错误条 v-html 双参改用、import 在场、双源旁路 + firstMetaRaw 选喂', () => {
    expect(diagSrc).toContain("import { errPreHtml, errMeta } from '../utils/errPre';");
    expect(diagSrc).toMatch(/v-html="errPreHtml\(loadErr, errMeta\(loadErrRaw\)\)"/);
    expect(diagSrc).toMatch(/v-html="errPreHtml\(opsErr, errMeta\(opsErrRaw\)\)"/);
    /* 原始对象旁路：catch 压串点不再丢 code/endpoint */
    expect(diagSrc).toContain('const loadErrRaw = ref<unknown>(null);');
    expect(diagSrc).toContain('const opsErrRaw = ref<unknown>(null);');
    expect(diagSrc).toMatch(/raws\.push\(e\)/);
    expect(diagSrc).toContain('loadErrRaw.value = firstMetaRaw(raws);');
    expect(diagSrc).toContain('opsErrRaw.value = firstMetaRaw(raws);');
    /* friendlyEsError 通道不回退：文案仍走 friendly 串（原语义保留） */
    expect(diagSrc).toContain("'诊断数据拉取失败：'");
    expect(diagSrc).toContain("'观测数据拉取失败：'");
  });

  it('TaskTreeView：err-bar 双参改用、loadErrRaw 旁路透传、成功清 raw、文案不回退', () => {
    expect(ttSrc).toContain("import { errPreHtml, errMeta } from '../utils/errPre';");
    expect(ttSrc).toMatch(/v-html="errPreHtml\(loadErr, errMeta\(loadErrRaw\)\)"/);
    expect(ttSrc).toContain('const loadErrRaw = ref<unknown>(null);');
    expect(ttSrc).toMatch(/loadErrRaw\.value = e;/);
    expect(ttSrc).toMatch(/loadErr\.value = '';\s*\n\s*loadErrRaw\.value = null;/);
    expect(ttSrc).toContain('friendlyEsError(String(e?.message ?? e))');
  });
});

describe('五百四十七批：errMeta 铺装行为锁（ApiError 出元信息行，普通 Error 零回退）', () => {
  it('TaskTreeView：clusterTasks 拒绝 ApiError → err-bar 含 code 徽标 + 失败于 端点 + 原文案', async () => {
    tasksFn.mockRejectedValue(new ApiError(503, '上游超时', 'ES_ERROR', 'GET /internal/es/console/tasks'));
    const { host } = await mountView(TaskTreeView);
    const bar = host.querySelector('.err-bar');
    expect(bar, '失败必须出现错误条').toBeTruthy();
    expect(bar!.innerHTML).toContain('ep-err-code');
    expect(bar!.innerHTML).toContain('ES_ERROR');
    expect(bar!.innerHTML).toContain('ep-err-endpoint');
    expect(bar!.innerHTML).toContain('失败于 GET /internal/es/console/tasks');
    /* 原错误文案语义不回退：压串后的 friendly 全文仍在 */
    expect(bar!.textContent).toContain('上游超时');
  });

  it('TaskTreeView：普通 Error（无 code/endpoint）→ err-bar 无元信息行（空 meta 与单参一致）', async () => {
    tasksFn.mockRejectedValue(new Error('connect refused'));
    const { host } = await mountView(TaskTreeView);
    const bar = host.querySelector('.err-bar');
    expect(bar, '失败必须出现错误条').toBeTruthy();
    expect(bar!.innerHTML, '无 code/endpoint 不出徽标行').not.toContain('ep-err-code');
    expect(bar!.innerHTML).not.toContain('ep-err-endpoint');
    expect(bar!.textContent).toContain('connect refused');
  });

  it('DiagView：health 拒绝 ApiError → loadErr 条含「失败于 端点」；双源聚合文案保持记名', async () => {
    healthFn.mockRejectedValue(new ApiError(403, '索引不存在', 'CONN_FORBIDDEN', 'GET /internal/es/console/health'));
    clusterHealthFn.mockResolvedValue({ status: 'green' });
    nodesStatsFn.mockResolvedValue([]);
    pendingTasksFn.mockResolvedValue({ tasks: [] });
    const { host } = await mountView(DiagView);
    await settle(6);
    const bar = host.querySelector('.err-bar');
    expect(bar, '诊断双源失败必须出现错误条').toBeTruthy();
    expect(bar!.innerHTML).toContain('ep-err-code');
    expect(bar!.innerHTML).toContain('CONN_FORBIDDEN');
    expect(bar!.innerHTML).toContain('失败于 GET /internal/es/console/health');
    /* 记名聚合文案不回退（失败源名仍在） */
    expect(bar!.textContent).toContain('诊断数据拉取失败：');
    expect(bar!.textContent).toContain('health（');
  });
});
