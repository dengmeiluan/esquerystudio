/**
 * W2 批：PainlessLabView 源码/params 比例可调 + 结果区高度档 + 左栏宽度档。
 *  ① 左栏宽度三档（data-pl-rail-w，usePref painless.railW，默认 260=原 minmax 上限）；
 *  ② 结果区高度三档（data-pl-out-h，usePref painless.outH，默认 260=原写死值）；
 *  ③ 源码/params 中缝 SplitHandle 拖拽（usePref painless.srcH，0=原 15:11 flex；双击重置）。
 *
 * 设施：devxThreeState 范式（MonacoEditor stub + api 出口惰性包装）；
 * 拖拽走真实 SplitHandle 指针序列（pointerdown → window pointermove → window pointerup）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const painlessExecuteFn = vi.fn();
const listStoredScriptsFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      painlessExecute: (...a: any[]) => painlessExecuteFn(...a),
      listStoredScripts: (...a: any[]) => listStoredScriptsFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import PainlessLabView from '../views/PainlessLabView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  location.hash = '#/painless-lab';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/update-by-query', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(PainlessLabView) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function btn(host: ParentNode, sel: string): HTMLButtonElement {
  const b = host.querySelector<HTMLButtonElement>(sel);
  expect(b, sel + ' 必须在场').toBeTruthy();
  return b!;
}

/** 拖拽 SplitHandle：起点按下，move dy，抬起 */
async function dragHandle(handle: Element, dy: number) {
  handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
  await settle(2);
  window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientY: dy }));
  await settle(2);
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientY: dy }));
  await settle(4);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  listStoredScriptsFn.mockResolvedValue({ scripts: {} });
  painlessExecuteFn.mockReset();
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('W2 批：PainlessLab 布局可调', () => {
  it('① 左栏宽度档：默认 --pl-rail-w 260px → 点宽 → 320 落盘', async () => {
    const host = await mountView();
    expect(host.querySelector('.pl-body')!.getAttribute('style')).toContain('--pl-rail-w: 260px');
    btn(host, '[data-pl-rail-w]').click();
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.painless.railW')).toBe('320');
    expect(host.querySelector('.pl-body')!.getAttribute('style')).toContain('--pl-rail-w: 320px');
  });

  it('② 结果区高度档：试跑出结果默认 maxHeight 260px → 点高 → 400 落盘', async () => {
    const host = await mountView();
    painlessExecuteFn.mockResolvedValue({ result: 3 });
    const run = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.textContent?.includes('试跑'));
    expect(run, '「试跑」必须在场').toBeTruthy();
    run!.click();
    await settle();
    const out = host.querySelector<HTMLElement>('.pl-out');
    expect(out, '结果区必须在').toBeTruthy();
    expect(out!.style.maxHeight).toBe('260px');
    btn(host, '[data-pl-out-h]').click();
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.painless.outH')).toBe('400');
    expect(host.querySelector<HTMLElement>('.pl-out')!.style.maxHeight).toBe('400px');
  });

  it('③ 源码/params 中缝拖拽：默认 flex 比例（无内联高）→ 拖 80px → srcH 落盘+源码定高；双击重置', async () => {
    const host = await mountView();
    const handle = host.querySelector('.pl-editor .split-handle');
    expect(handle, '源码/params 拖拽柄必须在场（axis-horizontal）').toBeTruthy();
    expect(handle!.getAttribute('aria-orientation')).toBe('horizontal');
    const srcEd = host.querySelector<HTMLElement>('.pl-src-ed');
    expect(srcEd!.style.height, '默认 15:11 flex，无内联高').toBe('');
    await dragHandle(handle!, 80);
    expect(localStorage.getItem('esquerystudio.pref.painless.srcH')).toBe('230');
    expect(srcEd!.style.height).toBe('230px');
    handle!.dispatchEvent(new Event('dblclick'));
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.painless.srcH')).toBe('0');
    expect(srcEd!.style.height).toBe('');
  });

  it('③ 源码锁：SplitHandle 接线与 clamp 域（100..2400）', () => {
    const v = readFileSync(join(__dirname, '../views/PainlessLabView.vue'), 'utf-8');
    expect(v).toMatch(/<SplitHandle axis="horizontal" :size="plSrcH > 0 \? plSrcH : 150" :min="100" :max="2400"/);
    expect(v).toContain('function clampSrcH(s: number) { return Math.round(Math.min(2400, Math.max(100, s))); }');
  });
});
