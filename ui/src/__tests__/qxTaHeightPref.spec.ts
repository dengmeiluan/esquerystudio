/**
 * 五百二十批：QueryXrayView 编辑器卡片高度持久化（usePref qx.taH）。
 *
 * 契约：
 * ① 初始读偏好：预置 esquerystudio.pref.qx.taH 挂载即恢复（卡片内联 height）；
 * ② 默认 260px 保持历史视觉（未拖拽过无内联覆写偏好时）；
 * ③ pointerup 落盘接线（源码锁）：拖拽结束读实高落盘，0 高（无布局）守卫不写。
 *
 * 设施：vue-router 轻 mock + 只 mock ../api。MonacoEditor 以 stub 浅挂载（JsonArea 内层；
 * 组件正处并行批次在途改造期——stub 隔离施工竞争，高度偏好行为网不依赖编辑器本体）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const routeMock = { path: '/query-xray', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

/* MonacoEditor stub：透传 height prop（JsonArea fill 语义不在本网范围） */
vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute'],
      setup(props: any) {
        return () => h('div', { class: 'monaco-host', style: { height: props.height } });
      },
    }),
  };
});

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      /* 页面动作 mock（挂载不触发，防御兜底） */
      validateQuery: () => Promise.resolve({}),
      termVectors: () => Promise.resolve({}),
      aliases: () => Promise.resolve([]),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import QueryXrayView from '../views/QueryXrayView.vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView() {
  const app = createApp({ render: () => h(QueryXrayView as any) });
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

describe('QueryXray 编辑器卡高度持久化（五百二十批）', () => {
  it('默认 260px（历史视觉不变）；预置偏好挂载即恢复 300px', async () => {
    const host = await mountView();
    const card = () => host.querySelector<HTMLElement>('.qx-card-ed')!;
    expect(card(), '编辑器卡必须渲染').toBeTruthy();
    expect(card().style.height).toBe('260px');
    apps.forEach(a => a.unmount()); apps.length = 0;
    document.body.innerHTML = '';
    localStorage.setItem('esquerystudio.pref.qx.taH', JSON.stringify('300px'));
    const host2 = await mountView();
    expect(host2.querySelector<HTMLElement>('.qx-card-ed')!.style.height).toBe('300px');
  });

  it('pointerup 落盘接线（源码锁）+ 0 高守卫：无布局环境 pointerup 不写坏偏好', async () => {
    const host = await mountView();
    const card = host.querySelector<HTMLElement>('.qx-card-ed')!;
    /* happy-dom 无布局：rect 高 0 → 守卫拦住，不把 '0px' 写进偏好 */
    card.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.qx.taH')).toBe(null);
    /* 源码锁：resize 落盘链在位（卡片 resize + pointerup 实高落盘） */
    const v = readFileSync(join(__dirname, '../views/QueryXrayView.vue'), 'utf-8');
    expect(v).toMatch(/\.qx-card-ed \{[^}]*resize: vertical/);
    expect(v).toContain('@pointerup="saveTaH"');
    expect(v).toContain("usePref<string>('qx.taH', '260px')");
    expect(v).toContain("taH.value = h + 'px'");
  });
});
