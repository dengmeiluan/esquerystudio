/**
 * 三百零五批：行→文档链路——QRT 右键「在数据浏览器打开此文档」+ BrowserView ?idx=&doc= 深链。
 * 深链消费即清防刷新重灌；文档详情右下悬浮卡可关闭。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const pushSpy = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }), useRoute: () => ({ path: '/browser', query: { idx: 'idx-a', doc: 'doc-1' } }) }));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([{ index: 'idx-a', health: 'green', status: 'open', 'docs.count': 1 }]),
      raw: vi.fn(() => Promise.resolve({ _id: 'doc-1', _source: { name: 'x' } })),
      /* 963：深链文档卡改走 GET /cluster/doc（VIEWER 可读），不再借道 ADMIN raw */
      getDoc: vi.fn(() => Promise.resolve({ _id: 'doc-1', _source: { name: 'x' } })),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import BrowserView from '../views/BrowserView.vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountView() {
  /* useUrlState 读 location.hash 的 query（非 route.query）——深链在挂载前种进 hash */
  history.replaceState(null, '', '#/browser?idx=idx-a&doc=doc-1');
  const app = createApp({ setup: () => () => h(BrowserView as any) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 4) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  pushSpy.mockClear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('行→文档深链（305 批）', () => {
  it('BrowserView：?idx 落 pickedIdx；?doc 打开悬浮详情并可关闭', async () => {
    const { useAppStore } = await import('../stores/app');
    await mountView();
    const store = useAppStore();
    expect(store.pickedIdx, '?idx= 应落 pickedIdx').toBe('idx-a');
    await tick();
    const card = host.querySelector('[data-test="linked-doc"]') as HTMLElement;
    expect(card, '深链文档详情卡应渲染').toBeTruthy();
    expect(card.textContent).toContain('doc-1');
    expect(card.textContent).toContain('"name"');
    /* 776 锁同步更新：卡头新增 FileJson 原始响应钮（G253）后「卡内第一钮=关闭」隐含锚失效——
       按 aria-label 取关闭钮（775 flattenWave557 锁同步更新同款） */
    ([...card.querySelectorAll('button')] as HTMLButtonElement[])
      .find(b => b.getAttribute('aria-label') === '关闭文档详情')!.click();
    await tick();
    expect(host.querySelector('[data-test="linked-doc"]'), '关闭后卡片消失').toBeNull();
  });

  it('BrowserView 源码锁：消费即清（doc/idx 双参）', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const s = readFileSync(join(__dirname, '../views/BrowserView.vue'), 'utf-8');
    expect(s).toMatch(/docLink\.value = '';/);
    expect(s).toMatch(/idxLink\.value = '';/);
    expect(s).toMatch(/openLinkedDoc\(store\.pickedIdx, docId\)/);
  });
});
