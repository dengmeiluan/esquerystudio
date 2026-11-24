/**
 * 942 批：DevToolsView 走查五刀（重置/清史确认链执行闸 + 取消通道丢弃语义 + 多段取消断链 + 死规则退役）。
 *
 * 刀① 重置确认链执行闸缺失（reset）：执行体含确认窗 await，互斥置位缺失——确认窗挂起
 *   期间重置钮可点，二击穿透双开确认窗（confirm.ts 全局单例 resolver 覆写把第一开按取消
 *   静默收掉）。修法口径=闸读收本体首行+置位前移到第一个 await 之前+try/finally 全包裹
 *   +钮面 :disabled 双保险（xmigrateGateExport941/templateSaveGate937/securityRebindGate940
 *   同族口径；确认后动作同步（doReset 无 await），无跨窗钉住语义）。
 * 刀② 清空本 Tab 历史确认链同构（askClearTabHist）：QueryHistoryPanel clear 事件直进
 *   确认窗 await，闸缺失——二击双开同构。修法=clearingHist 闸同刀① 形态。
 * 刀③ 取消通道失败样貌（执行体 catch 甄别缺位）：用户点「取消」后 AbortError 落失败
 *   渲染链——err-bar 红条「✗ 执行失败/已取消（用户中止本次请求）」+失败历史红点+汇聚
 *   镜像 ok:false（924-C1 真矿指纹：主动取消看到失败样貌）。修法=catch 首分支甄别
 *   AbortError→info 轻提示带耗时（DslQueryView 同语言）+丢弃（不写 errBrief/历史/镜像）；
 *   execSend 返回 boolean（false=取消）承载段执行断链；真失败仍走失败链（防过宽对照锚）。
 * 刀④ 多段执行取消断链：runSmart(all) 逐段 execOneSeg，useQueryRun.cancel 无持久态
 *   （逐段 begin 新建控制器）——取消只杀当前段 fetch，余段照发（取消语义断裂）。
 *   修法=execOneSeg 透传取消（false 即 break），取消段不进段锚（丢弃口径一致）。
 * 刀⑤ .dt-out-pre 死规则×2 退役：裸 pre 元素 Monaco 化后模板零挂载，样式残段
 *   （devtoolsSmartAssist 只锁元素缺席不锁样式，负锚字符串曾让全树 grep 误判挂载）。
 *
 * 锁定形态：行为锚（视图全真挂载+monaco stub 可编程+askConfirm 手控回包+api.raw mock
 * 信号可中止）+源码锁双通道；dtSegMark565 段锚锁与 kibanaWave562 execSend 签名锁随
 * 合法新形态升格（909-C1④ 守卫随迁通道），histFav546 清空链三锁子串/距离窗兼容零触。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

/* ═══════════ 源码锁 ═══════════ */

describe('942 刀① 重置确认链执行闸（源码锁）', () => {
  it('reset 本体闸读首行+置位前移 askConfirm+try/finally 复位+钮面双保险', () => {
    expect(dt).toContain('const resetting = ref(false);');
    expect(dt, '闸读收本体首行').toMatch(/async function reset\(\) \{\s*if \(resetting\.value\) return;/);
    expect(dt, '置位前移到确认窗 await 之前').toMatch(/resetting\.value = true;\s*try \{\s*const ok = await askConfirm\(/);
    expect(dt, '取消路径 finally 复位防闸死').toMatch(/if \(!ok\) return;\s*doReset\(\);\s*\} finally \{ resetting\.value = false; \}/);
    expect(dt, '重置钮面 disabled 双保险').toContain(':disabled="resetting"');
  });
});

describe('942 刀② 清空本 Tab 历史确认链执行闸（源码锁）', () => {
  it('askClearTabHist 闸读首行+置位前移 askConfirm+try/finally 复位', () => {
    expect(dt).toContain('const clearingHist = ref(false);');
    expect(dt, '闸读收本体首行').toMatch(/async function askClearTabHist\(\) \{\s*if \(clearingHist\.value\) return;/);
    expect(dt, '置位前移到确认窗 await 之前').toMatch(/clearingHist\.value = true;\s*try \{\s*const ok = await askConfirm\(/);
    expect(dt, '取消路径 finally 复位防闸死').toMatch(/if \(!ok\) return;\s*t\.history = \[\];\s*\} finally \{ clearingHist\.value = false; \}/);
  });
});

describe('942 刀③ 取消通道丢弃语义（源码锁）', () => {
  it('execSend 返回 boolean 承载取消；catch 首分支甄别 AbortError→info 轻提示丢弃', () => {
    expect(dt).toContain('async function execSend(t: Tab, bodyOut: string, segLabel?: string): Promise<boolean> {');
    expect(dt, '取消=info 轻提示带耗时（DslQueryView 同语言）+丢弃')
      .toMatch(/if \(e\?\.name === 'AbortError'\) \{\s*store\.notify\('info', '已取消（' \+ \(qr\.elapsedMs\.value \/ 1000\)\.toFixed\(1\) \+ 's）'\);\s*return false;/);
    expect(dt, '失败分支不再吞取消（甄别已前移，错误摘要只走 friendlyEsError）')
      .toContain('t.errBrief = friendlyEsError(t.result);');
    expect(dt, '真失败仍写失败历史红点（防过宽：只挪取消不吞错误）')
      .toContain('mirrorHistAll({ method: t.method, path: t.path, body: t.body, ts: Date.now(), ok: false, took: t.took });');
  });
});

describe('942 刀④ 多段执行取消断链（源码锁）', () => {
  it('execOneSeg 返回 boolean 透传取消；runSmart(all) 取消即断链+取消段不进段锚', () => {
    expect(dt).toContain('async function execOneSeg(seg: DtSeg, i: number, n: number): Promise<boolean> {');
    expect(dt, '取消段不进段锚').toMatch(/const done = await execSend\(t, bodyOut, 'seg ' \+ \(i \+ 1\) \+ '\/' \+ n\);\s*if \(!done\) return false;/);
    expect(dt, '取消即断链（余段不再起跑）')
      .toMatch(/for \(let i = 0; i < segs\.length; i\+\+\) \{ if \(!\(await execOneSeg\(segs\[i\], i, segs\.length\)\)\) break; \}/);
  });
});

describe('942 刀⑤ 死规则退役（源码锁）', () => {
  it('.dt-out-pre 死规则随裸 pre 元素退役（模板零挂载；devtoolsSmartAssist 只锁元素缺席）', () => {
    expect(dt, '裸 pre Monaco 化后样式残段清零').not.toContain('.dt-out-pre');
  });
});

/* ═══════════ 行为锁（dtSegMark565/kibanaWave562 挂载范式） ═══════════ */

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
const askConfirmFn = vi.fn();
vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));

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
import { useAppStore } from '../stores/app';

const TWO_SEGS = '{"a":1}\n\n{"b":2}';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];
let pendingConfirms: { res: (v: boolean) => void }[] = [];

function releaseConfirm(v: boolean) {
  const p = pendingConfirms.shift();
  if (!p) throw new Error('no pending confirm');
  p.res(v);
}

/* 可中止 raw mock：signal abort 即以 AbortError reject（useQueryRun.cancel 通路） */
function abortableRaw() {
  return (_m: string, _p: string, _b: string, signal?: AbortSignal) =>
    new Promise((_res, rej) => {
      signal?.addEventListener('abort', () => rej(Object.assign(new Error('canceled'), { name: 'AbortError' })));
    });
}

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
  return { host, store: useAppStore(pinia) };
}

function btnByText(host: ParentNode, label: string): HTMLButtonElement {
  const btn = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find(b => (b.textContent || '').trim() === label);
  if (!btn) throw new Error('button not found: ' + label);
  return btn;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  monacoCaps.length = 0;
  pendingConfirms = [];
  rawFn.mockReset().mockResolvedValue({ status: 200, body: 'ok' });
  askConfirmFn.mockReset().mockImplementation(() => new Promise<boolean>((res) => { pendingConfirms.push({ res }); }));
});
afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

describe('942 刀① 重置确认链执行闸（行为锁）', () => {
  it('确认窗挂起期间二击不穿透：确认计数恒 1、重置钮即禁用；确认后落清+取消路径可再进', { timeout: 20000 }, async () => {
    const { host } = await mountView();
    expect(host.querySelectorAll('.dt-tab').length, '默认三示例标签').toBe(3);
    const btn = btnByText(host, '重置');
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    expect(pendingConfirms.length).toBe(1);
    /* 闸置位前移后重置钮在确认窗期间即禁用（穿透窗消除） */
    expect(btn.disabled).toBe(true);
    btn.click();                                    /* 二击：闸读+钮面禁用双保险 */
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);  /* 单开铁证 */
    releaseConfirm(true);
    await settle(8);
    expect(host.querySelectorAll('.dt-tab').length, '确认后落清（单新标签）').toBe(1);
    expect(btn.disabled, '闸复位（try/finally）').toBe(false);
    /* 取消路径复位防闸死：可再进确认，取消不清 */
    host.querySelector<HTMLElement>('.dt-tab-add')!.click();
    await settle(4);
    expect(host.querySelectorAll('.dt-tab').length).toBe(2);
    btn.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(2);
    releaseConfirm(false);
    await settle(6);
    expect(host.querySelectorAll('.dt-tab').length, '取消不清').toBe(2);
    expect(btn.disabled).toBe(false);
  });
});

describe('942 刀② 清空本 Tab 历史确认链执行闸（行为锁）', () => {
  it('确认窗挂起期间二击不穿透：确认计数恒 1；取消不清+确认后清', { timeout: 20000 }, async () => {
    const { host } = await mountView();
    monacoCaps[0]!.emit('execute');                 /* 默认标签单段体=全量 run */
    await settle(10);
    expect(host.querySelectorAll('.qhp-item').length, '一条成功历史').toBe(1);
    const clearBtn = host.querySelector<HTMLButtonElement>('.qhp-bar button.danger');
    expect(clearBtn, '清空钮在场（clearable 本 Tab 档）').toBeTruthy();
    clearBtn!.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);
    expect(pendingConfirms.length).toBe(1);
    clearBtn!.click();                              /* 二击穿透窗（闸读在执行体） */
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(1);  /* 单开铁证 */
    releaseConfirm(false);
    await settle(6);
    expect(host.querySelectorAll('.qhp-item').length, '取消不清').toBe(1);
    clearBtn!.click();
    await settle(6);
    expect(askConfirmFn).toHaveBeenCalledTimes(2);  /* 可再进确认 */
    releaseConfirm(true);
    await settle(8);
    expect(host.querySelector('.qhp-empty')!.textContent, '确认后清空（本 Tab 档空态；跨 Tab 汇聚镜像仍在=既有设计）').toContain('暂无本 Tab 历史');
  });
});

describe('942 刀③ 取消通道丢弃语义（行为锁）', () => {
  it('用户取消：info 轻提示带耗时+丢弃——零错误条/零失败历史/空态回归', { timeout: 20000 }, async () => {
    rawFn.mockImplementation(abortableRaw());
    const { host, store } = await mountView();
    const notifySpy = vi.spyOn(store, 'notify');
    monacoCaps[0]!.emit('execute');
    await settle(6);
    const cancelBtn = btnByText(host, '取消');
    cancelBtn.click();
    await settle(10);
    expect(rawFn).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith('info', expect.stringMatching(/^已取消（\d+\.\ds）$/));
    expect(host.querySelector('.dt-err'), '取消不落错误条（失败样貌消除）').toBeNull();
    expect(host.querySelector('.dt-hist'), '取消不写失败历史（容器随零历史退场）').toBeNull();
    expect(host.textContent, '空态回归').toContain('输入 REST 请求执行');
  });

  it('真失败仍走失败链（防过宽对照锚）：错误条+失败历史红点在场', { timeout: 20000 }, async () => {
    rawFn.mockReset().mockRejectedValue(Object.assign(new Error('es boom'), { status: 500, name: 'ApiError' }));
    const { host } = await mountView();
    monacoCaps[0]!.emit('execute');
    await settle(10);
    const errBar = host.querySelector('.dt-err');
    expect(errBar, '真失败保留错误条').toBeTruthy();
    expect(errBar!.textContent).toContain('es boom');
    expect(host.querySelectorAll('.qhp-item').length, '失败历史入列').toBe(1);
    expect(host.querySelector('.qhp-fail'), '失败红点在场').toBeTruthy();
  });
});

describe('942 刀④ 多段执行取消断链（行为锁）', () => {
  it('两段全跑取消段1：余段不再起跑（断链铁证）+取消段不进段锚', { timeout: 20000 }, async () => {
    rawFn.mockImplementation((_m: string, _p: string, body: string, signal?: AbortSignal) =>
      body.includes('"a"')
        ? new Promise((_res, rej) => { signal?.addEventListener('abort', () => rej(Object.assign(new Error('canceled'), { name: 'AbortError' }))); })
        : Promise.resolve({ status: 200, body: '{"seg2":"never"}' }));
    const { host } = await mountView();
    monacoCaps[0]!.emit('update:modelValue', TWO_SEGS);
    await settle();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, cancelable: true, bubbles: true }));
    await settle(6);
    expect(rawFn).toHaveBeenCalledTimes(1);         /* 段1 在途 */
    btnByText(host, '取消').click();
    await settle(16);
    expect(rawFn, '取消即断链：段2 不再起跑').toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('.dt-segbar .dt-seg-run').length, '取消段不进段锚').toBe(0);
  });

  it('无取消时全段照跑（现状守卫）：两段两徽标不受断链改造影响', { timeout: 20000 }, async () => {
    rawFn.mockReset().mockResolvedValue({ status: 200, body: '{"ok":1}' });
    const { host } = await mountView();
    monacoCaps[0]!.emit('update:modelValue', TWO_SEGS);
    await settle();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, cancelable: true, bubbles: true }));
    await settle(12);
    expect(rawFn).toHaveBeenCalledTimes(2);
    expect(host.querySelectorAll('.dt-segbar .dt-seg-run').length, '两段两徽标').toBe(2);
  });
});
