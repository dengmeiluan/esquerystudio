/**
 * 五百六十五批·轨2 W2 件⑤：DevTools 多段执行 per-段锚定（段结果徽标 + 点击回看）。
 *
 *  背景：runSmart(all) 多段顺序执行共用单一响应区——execOneSeg 每次 t.result=null 后覆写，
 *  前段响应被后段冲掉（Kibana 每请求有独立响应位）；失败段现场尤其易丢。
 *
 *  最小确定方案（主响应区现行为零触）：
 *  · Tab 增 segRuns 段执行锚数组 + segView 当前回看位（**不落盘**——writeDraft/恢复侧剥离，
 *    与 result 同保密级）；
 *  · execOneSeg 每段执行完快照 {label(i/n), ok, took, status, errBrief, result, resultFull,
 *    truncated} 到段位 i（段位稳定：重复执行同段覆写同槽）；
 *  · runSmart(all) 起跑先清 segRuns（全部段重跑=全量重锚）；单段执行覆写本段槽；
 *  · 响应工具行渲染段徽标（seg i/n + ✓/✗ + took；chip 形态对齐 dt-hist-chip），点击徽标把
 *    该段响应载回主响应区（active 段高亮）。
 *
 *  挂载范式同 kibanaWave562（monaco stub 可编程 + api.raw mock）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

/* ═══════════ 源码锁 ═══════════ */

describe('565 件⑤：段执行锚定接线（源码锁）', () => {
  it('Tab 增 segRuns 段锚数组 + segView 回看位（不落盘：writeDraft 剥离）', () => {
    expect(dt).toMatch(/segRuns\?: DtSegRun\[\];/);
    expect(dt).toMatch(/segView\?: number;/);
    expect(dt, '落盘剥离（与 result 同保密级，恢复侧零回带）').toContain('segRuns: [], segView: -1');
  });
  it('execOneSeg 段位快照 + runSmart(all) 起跑清锚；562 段执行三件套签名零触', () => {
    expect(dt).toContain('t.segRuns[i] = { label: \'seg \' + (i + 1) + \'/\' + n,');
    /* 942 随迁：循环体升格「取消即断链」（execOneSeg 返回 boolean，false=取消不进锚）；起跑清锚语义零触 */
    expect(dt).toMatch(/if \(all\) \{\s*(?:\/\*[^\n]*\*\/\s*)?t\.segRuns = \[\]; t\.segView = -1;\s*for \(let i = 0; i < segs\.length; i\+\+\) \{ if \(!\(await execOneSeg\(segs\[i\], i, segs\.length\)\)\) break; \}/);
    expect(dt).toContain('async function execOneSeg(seg: DtSeg, i: number, n: number): Promise<boolean> {');
    expect(dt).toMatch(/await execSend\(t, bodyOut, 'seg ' \+ \(i \+ 1\) \+ '\/' \+ n\);/);
  });
  it('响应工具行段徽标组（i/n+状态+took，点击回看）+ loadSegRun 回放主响应区', () => {
    expect(dt).toMatch(/<div v-if="cur\.segRuns\?\.length" class="dt-segbar" role="group" aria-label="分段执行结果">/);
    expect(dt).toContain('function loadSegRun(run: DtSegRun, i: number) {');
  });
});

/* ═══════════ 行为锁（kibanaWave562 挂载范式） ═══════════ */

const rawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      raw: (...args: any[]) => rawFn(...args),
      devtoolsExecute: (...args: any[]) => rawFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});

/* Monaco stub：props/emit 捕获（monacoCaps 形态——请求体是第 0 个 stub） */
const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'dslAssist', 'readonly', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) {
      monacoCaps.push({ props, emit });
      return { getEditor: () => null };
    },
    template: '<div class="monaco-stub"></div>',
  },
}));

import DevToolsView from '../views/DevToolsView.vue';

const TWO_SEGS = '{"a":1}\n\n{"b":2}';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView() {
  location.hash = '#/devtools';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/devtools', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(DevToolsView as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host };
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  monacoCaps.length = 0;
  rawFn.mockReset().mockResolvedValue({ status: 200, body: 'ok' });
});
afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

describe('565 件⑤：多段执行段徽标独立 + 点击回看（行为锁）', () => {
  it('两段全跑（段1成功/段2失败）：两枚徽标状态独立；主响应区=末段（现行为）；点段1徽标回看段1响应', async () => {
    rawFn.mockImplementation((_m: string, _p: string, body: string) =>
      body.includes('"a"') ? Promise.resolve({ status: 200, body: '{"okA":true}' }) : Promise.reject(Object.assign(new Error('es boom'), { status: 500, name: 'ApiError' })));
    const { host } = await mountView();
    monacoCaps[0]!.emit('update:modelValue', TWO_SEGS);
    await settle();
    /* Shift+Ctrl+Enter 全部段（window 全局键路径，kibanaWave562 同手法） */
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, cancelable: true, bubbles: true }));
    await settle();
    expect(rawFn).toHaveBeenCalledTimes(2);
    /* 两枚徽标独立：ok / err + took 在场 */
    const chips = host.querySelectorAll<HTMLButtonElement>('.dt-segbar .dt-seg-run');
    expect(chips.length, '段1+段2 两枚徽标').toBe(2);
    expect(chips[0]!.textContent).toContain('seg 1/2');
    expect(chips[0]!.textContent).toContain('✓');
    expect(chips[1]!.textContent).toContain('seg 2/2');
    expect(chips[1]!.textContent).toContain('✗');
    expect(chips[1]!.classList.contains('err'), '失败段 err 档').toBe(true);
    /* 主响应区保持现行为=末次响应（失败现场）。⚠段执行中 result=null 会让响应 Monaco
       v-if 卸载重挂（caps 捕获的旧实例失联）——按 DOM 第 2 个 stub 取活实例读 props */
    const respProps = () => (host.querySelectorAll('.monaco-stub')[1] as any).__vueParentComponent.props;
    expect(String(respProps().modelValue)).toContain('es boom');
    /* 点击段1徽标：段1响应载回主响应区（成功段不丢） */
    chips[0]!.click();
    await settle();
    expect(String(respProps().modelValue)).toContain('"okA"');
    expect(chips[0]!.classList.contains('on'), '回看段徽标高亮').toBe(true);
  });

  it('单段重复执行覆写本段槽（段位稳定不累积）；草稿落盘剥离段锚', async () => {
    const { host } = await mountView();
    monacoCaps[0]!.emit('update:modelValue', TWO_SEGS);
    await settle();
    monacoCaps[0]!.emit('execute'); /* 光标段执行（stub 无光标=首段） */
    await settle();
    monacoCaps[0]!.emit('execute');
    await settle();
    const chips = host.querySelectorAll('.dt-segbar .dt-seg-run');
    expect(chips.length, '重复执行同段覆写同槽（不累积）').toBe(1);
    expect(rawFn).toHaveBeenCalledTimes(2);
    /* 落盘剥离：segRuns 不进草稿（writeDraft 剥离为空数组，恢复侧零回带） */
    await new Promise(r => setTimeout(r, 350)); /* persist 300ms 防抖冲刷 */
    const draft = JSON.parse(sessionStorage.getItem('es_devtools_draft:host') || '{}');
    expect(draft.tabs?.[0]?.segRuns, '段锚不落盘（剥离为空）').toEqual([]);
    expect(draft.tabs?.[0]?.segView).toBe(-1);
  });
});
