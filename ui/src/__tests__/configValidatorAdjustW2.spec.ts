/**
 * W2 批：ConfigValidatorView 双 Monaco 比例可调 + 问题清单高度档。
 *  ① 双栏比例：中缝 SplitHandle 拖拽（cvLeftW 落 usePref configvalidator.leftW，0=等分 1fr；
 *     双击重置）；grid 列走 --cv-left-w 变量；
 *  ② 问题清单高度三档（data-cv-issues-h，usePref configvalidator.issuesH，默认 380=原写死值）。
 *
 * 设施：monacoAssistAttach 范式（MonacoEditor stub 捕获 props；api 出口惰性包装）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const validateFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      configLab: { ...actual.api.configLab, validate: (...a: any[]) => validateFn(...a) },
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

import ConfigValidatorView from '../views/ConfigValidatorView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(ConfigValidatorView) });
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
  validateFn.mockReset();
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('W2 批：ConfigValidator 双栏比例 + 问题清单高度', () => {
  it('① 中缝拖拽柄在场；拖 80px → leftW 落盘（默认档 420 起点）+ --cv-left-w 生效；双击重置', async () => {
    const host = await mountView();
    const handle = host.querySelector('.cv-grid .split-handle');
    expect(handle, 'settings/mapping 拖拽柄必须在场（axis-vertical）').toBeTruthy();
    expect(handle!.getAttribute('aria-orientation')).toBe('vertical');
    expect(host.querySelector('.cv-grid')!.getAttribute('style'), '默认等分无内联变量').toBe(null);
    await dragHandle(handle!, 80);
    expect(localStorage.getItem('esquerystudio.pref.configvalidator.leftW')).toBe('500');
    expect(host.querySelector('.cv-grid')!.getAttribute('style')).toContain('--cv-left-w: 500px');
    handle!.dispatchEvent(new Event('dblclick'));
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.configvalidator.leftW')).toBe('0');
    expect(host.querySelector('.cv-grid')!.getAttribute('style')).toBe(null);
  });

  it('② 问题清单高度档：校验出报告默认 maxHeight 380px → 点高 → 560 落盘', async () => {
    const host = await mountView();
    validateFn.mockResolvedValue({
      valid: false, errorCount: 0, warnCount: 1, infoCount: 0, elapsedMs: 3,
      issues: [{ severity: 'WARN', layer: 'LINT', code: 'W1', message: '分片数偏多' }],
    });
    const lint = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.textContent?.includes('快速 Lint'));
    expect(lint, '「快速 Lint」必须在场').toBeTruthy();
    lint!.click();
    await settle();
    const issues = host.querySelector<HTMLElement>('.cv-issues');
    expect(issues, '问题清单必须在').toBeTruthy();
    expect(issues!.style.maxHeight).toBe('380px');
    btn(host, '[data-cv-issues-h]').click();
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.configvalidator.issuesH')).toBe('560');
    expect(host.querySelector<HTMLElement>('.cv-issues')!.style.maxHeight).toBe('560px');
  });

  it('② 源码锁：grid 列模板走 --cv-left-w（默认 1fr），窄屏断点隐藏拖拽柄', () => {
    const v = readFileSync(join(__dirname, '../views/ConfigValidatorView.vue'), 'utf-8');
    expect(v).toContain('grid-template-columns: var(--cv-left-w, 1fr) 11px minmax(0, 1fr)');
    expect(v).toContain('.cv-split { display: none; }');
    expect(v).toContain('const cvLeftW = usePref(\'configvalidator.leftW\', 0);');
  });
});
