/**
 * 五百二十批：AnalyzerLabView 分词输入高度持久化（usePref al.taH，qx.taH 同款口径）。
 *
 * 契约：
 * ① 默认空串不设内联高——textarea 保持 rows=3 历史视觉；
 * ② 预置偏好挂载即恢复（内联 height）；
 * ③ pointerup 落盘接线（源码锁）：拖拽结束读实高落盘，0 高守卫不写。
 *
 * 设施：vue-router 轻 mock + 只 mock ../api（本页无 Monaco，textarea 原生挂载）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const routeMock = { path: '/analyzer-lab', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      analyzeText: () => Promise.resolve({ tokens: [] }),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      clusterQuery: () => Promise.resolve({}),
      aliases: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import AnalyzerLabView from '../views/AnalyzerLabView.vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView() {
  const app = createApp({ render: () => h(AnalyzerLabView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  for (const k of Object.keys(routeMock.query)) delete routeMock.query[k];
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('分词实验室输入高度持久化（五百二十批）', () => {
  it('默认无内联高（rows=3 现状）；预置偏好挂载即恢复 120px', async () => {
    const host = await mountView();
    const ta = () => host.querySelector<HTMLTextAreaElement>('.al-txt')!;
    expect(ta(), '分词输入框必须渲染').toBeTruthy();
    expect(ta().style.height).toBe('');
    apps.forEach(a => a.unmount()); apps.length = 0;
    document.body.innerHTML = '';
    localStorage.setItem('esquerystudio.pref.al.taH', JSON.stringify('120px'));
    const host2 = await mountView();
    expect(host2.querySelector<HTMLTextAreaElement>('.al-txt')!.style.height).toBe('120px');
  });

  it('pointerup 落盘接线（源码锁）+ 0 高守卫：无布局环境 pointerup 不写坏偏好', async () => {
    const host = await mountView();
    const ta = host.querySelector<HTMLTextAreaElement>('.al-txt')!;
    /* happy-dom 无布局：rect 高 0 → 守卫拦住，不把 '0px' 写进偏好 */
    ta.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.al.taH')).toBe(null);
    /* 源码锁：resize 落盘链在位 */
    const v = readFileSync(join(__dirname, '../views/AnalyzerLabView.vue'), 'utf-8');
    expect(v).toMatch(/\.al-txt \{[^}]*resize: vertical/);
    expect(v).toContain('@pointerup="saveTaH"');
    expect(v).toContain("usePref<string>('al.taH', '')");
    expect(v).toContain('alTaH.value = h + \'px\'');
  });
});
