/**
 * W2 批：DiffEditorView 左右比例可调——中缝 SplitHandle 拖拽（docdiff.leftW 落 usePref，
 * 0=等分 1fr，双击重置），不迁 WorkbenchLayout；grid 列走 --df-left-w 变量。
 *
 * 设施：dataThreeState 范式（MonacoEditor stub + api.getDoc 出真文档 → df-grid 渲染）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const getDocFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getDoc: (...a: any[]) => getDocFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
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

import DiffEditorView from '../views/DiffEditorView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(DiffEditorView) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

async function dragHandle(handle: Element, dx: number) {
  handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
  await settle(2);
  window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: dx }));
  await settle(2);
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: dx }));
  await settle(4);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  getDocFn.mockReset();
  getDocFn.mockResolvedValue({ _id: '1', _version: 1, _seq_no: 2, _primary_term: 1, _source: { a: 1 } });
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('W2 批：DiffEditor 左右比例可调', () => {
  it('加载文档 → df-grid + 拖拽柄在场；拖 80px → leftW 落盘 + --df-left-w 生效；双击重置', async () => {
    /* R54：index+id 预置 URL → onMounted 自动拉取（useUrlState 读 location.hash，先于挂载预置） */
    const host = await mountView('#/?idx=orders&id=1');
    const grid = host.querySelector('.df-grid');
    expect(grid, '加载成功必须出编辑区').toBeTruthy();
    const handle = grid!.querySelector('.split-handle');
    expect(handle, '原始/编辑后 拖拽柄必须在场（axis-vertical）').toBeTruthy();
    expect(handle!.getAttribute('aria-orientation')).toBe('vertical');
    expect(grid!.getAttribute('style'), '默认等分无内联变量').toBe(null);
    await dragHandle(handle!, 80);
    expect(localStorage.getItem('esquerystudio.pref.docdiff.leftW')).toBe('560');
    expect(host.querySelector('.df-grid')!.getAttribute('style')).toContain('--df-left-w: 560px');
    handle!.dispatchEvent(new Event('dblclick'));
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.docdiff.leftW')).toBe('0');
    expect(host.querySelector('.df-grid')!.getAttribute('style')).toBe(null);
  });

  it('源码锁：grid 列模板走 --df-left-w（默认 1fr），窄屏断点隐藏拖拽柄', () => {
    const v = readFileSync(join(__dirname, '../views/DiffEditorView.vue'), 'utf-8');
    expect(v).toContain('grid-template-columns: var(--df-left-w, 1fr) 11px minmax(0, 1fr)');
    expect(v).toContain('.df-split { display: none; }');
    expect(v).toContain("const dfLeftW = usePref('docdiff.leftW', 0);");
  });
});
