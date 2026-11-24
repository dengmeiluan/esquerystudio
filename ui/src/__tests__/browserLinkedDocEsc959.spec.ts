/**
 * 九百五十九批：Browser 深链文档卡（bw-linked-doc）Esc 关闭通道。
 *
 * 现状：卡头 ✕ 钮是唯一关闭通道（aria-label=关闭文档详情）；document 级
 * keydown 监听（onDocBwEsc）只关导出聚合菜单（closeBwExp）——悬浮卡在场时
 * 按 Esc 无响应，铁律 D1#5「开弹层→Esc→收起」序列在卡面断链。深链打开
 * （?doc= 消费即清）无页面内触发器，焦点回归不适用，收卡即完整语义。
 *
 * 挂载/mock 形态与 browserRawDoc776 同源（视图/组件全真，只 mock ../api
 * 与 vue-router 出口；document 级监听由视图 setup 注册、卸载摘卸对称）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ path: '/browser', query: {} }) }));

const DOC_FULL = {
  _index: 'orders-v9', _id: 'doc-959-1', _version: 3, found: true,
  _source: { orderId: 'A-959', productName: '钛合金轴承' },
};

const rawFn = vi.fn();
const getDocFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([
        { index: 'orders-v9', health: 'green', status: 'open', 'docs.count': 1, 'store.size': '1kb', pri: 1, rep: 0, 'creation.date.string': '2026-10-01T08:30:00Z' },
      ]),
      raw: (...a: any[]) => rawFn(...a),
      getDoc: (...a: any[]) => getDocFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import BrowserView from '../views/BrowserView.vue';

const src = readFileSync(join(__dirname, '../views/BrowserView.vue'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountBrowser(hash = '#/browser') {
  location.hash = hash;
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ setup: () => () => h(BrowserView as any) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 20; i++) { await nextTick(); await Promise.resolve(); }
  return { app, host };
}

const pressEsc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  rawFn.mockReset().mockImplementation(async (_m: string, path: string) => {
    if (String(path).includes('_doc/')) return JSON.parse(JSON.stringify(DOC_FULL));
    return { acknowledged: true };
  });
  /* 963：深链文档卡改走 GET /cluster/doc（VIEWER 可读），raw 是 ADMIN 域 */
  getDocFn.mockReset().mockImplementation(async (_idx: string, _id: string) => JSON.parse(JSON.stringify(DOC_FULL)));
});

describe('959 深链文档卡 Esc 关闭通道', () => {
  it('Esc 收卡：深链开卡→document Escape→卡移除（✕ 钮语义不受影响）', async () => {
    await mountBrowser('#/browser?idx=orders-v9&doc=doc-959-1');
    expect(getDocFn, '深链消费走 api.getDoc（GET /cluster/doc）').toHaveBeenCalledTimes(1);
    expect(host.querySelector('.bw-linked-doc'), '深链文档卡开').toBeTruthy();

    pressEsc();
    await settle(6);
    expect(host.querySelector('.bw-linked-doc'), 'Esc 收卡').toBeNull();
    /* 页面主体健康：卡收不误伤工具条与索引表 */
    expect(host.querySelector('.bw-bar'), '工具条在场').toBeTruthy();
    expect(host.querySelector('table.qrt-tbl'), '索引表在场').toBeTruthy();
  });

  it('无卡时 Esc 仅走既有通道：导出菜单/页面零异常（不误伤）', async () => {
    await mountBrowser();
    expect(host.querySelector('.bw-linked-doc'), '无深链无卡').toBeNull();
    expect(() => pressEsc()).not.toThrow();
    await settle(6);
    expect(host.querySelector('.bw-bar'), '页面健康').toBeTruthy();
  });

  it('源码锁：onDocBwEsc 同时收卡与收菜单（单监听双通道，卸载摘卸既有）', () => {
    expect(src).toMatch(/function onDocBwEsc\(e: KeyboardEvent\) \{\s*\n\s*if \(e\.key === 'Escape'\) \{\s*\n\s*linkedDoc\.value = null;\s*\n\s*closeBwExp\(\);\s*\n\s*\}\s*\n\s*\}/);
  });
});
