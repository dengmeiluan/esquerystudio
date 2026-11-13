/**
 * 九百四十七批：浏览器工具条导出双钮合并「导出 ▾」聚合菜单（工具行密度横切批·浏览器侧）。
 *
 * bw-bar 工具条七控件（搜索框/健康分段/刷新/工作区/新建索引/CSV/Markdown）中，
 * CSV 下载与 Markdown 复制是同一对象（索引清单）的同类导出枚举平铺——查询结果表
 * 「导出 ▾」聚合形态同语言（铁律 C：同类枚举合一，常驻可见按钮 ≤5；铁律 B：低频
 * 动作收进菜单）。合并后工具条=搜索框/健康分段/刷新/工作区/新建索引/导出 ▾，可见
 * 按钮 5→4，触发钮落在原 CSV 位（位置恒定）。
 *
 * 空集语义不回退（九百三十六批口径）：宿主过滤筛空=触发钮恒在场 disabled；
 * 内核级空集（列漏斗筛空）报真 warning 保留在 exportCsv/exportMd 本体，菜单项直达。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ path: '/browser', query: {} }) }));

const INDICES = [
  { index: 'orders-v9', health: 'green', status: 'open', 'docs.count': 12345, 'store.size': '2.1gb', pri: 3, rep: 1, 'creation.date.string': '2026-09-30T10:00:00Z' },
  { index: 'logs-x', health: 'yellow', status: 'open', 'docs.count': 890, 'store.size': '450mb', pri: 1, rep: 1, 'creation.date.string': '2026-10-01T08:30:00Z' },
  { index: 'bad-c', health: 'red', status: 'close', 'docs.count': 42, 'store.size': '5mb', pri: 1, rep: 0, 'creation.date.string': '2026-08-15T00:10:00Z' },
];

const rawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve(INDICES),
      raw: (...a: any[]) => rawFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

const downloadFn = vi.fn();
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, downloadText: (...a: any[]) => downloadFn(...a), copyText: async () => true };
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { useAppStore } from '../stores/app';
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
  const pinia = createPinia();
  const app = createApp({ setup: () => () => h(BrowserView as any) });
  app.use(pinia);
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 20; i++) { await nextTick(); await Promise.resolve(); }
  return { app, host, store: useAppStore(pinia) };
}

/* setupState 通道（组件实例直取；ref 经 proxy 解包读写） */
const ss = (): any => (host.querySelector('.bw') as any).__vueParentComponent.setupState;
const barBtn = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.bw-bar button')]
  .find(b => (b.textContent || '').includes(label));

/* getCsvBlock 桩：head 与 EXPORT_SRC 七列同名（列对齐 indexOf 通道） */
const oneRowBlk = () => ({ head: ['索引', '健康', '状态', '文档数', '存储', '分片', '创建时间'], rows: [['a-1', 'green', 'open', 1, '1kb', '1/0', 'x']] });
const emptyBlk = () => ({ head: ['索引', '健康', '状态', '文档数', '存储', '分片', '创建时间'], rows: [] as any[][] });

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  rawFn.mockReset().mockResolvedValue({ acknowledged: true });
  downloadFn.mockReset();
});

describe('九百四十七批 A 源码锁：导出 ▾ 聚合形态', () => {
  it('触发钮聚合形态（menu-wrap 壳+haspopup/expanded+空行集恒在场 disabled）', () => {
    const at = src.indexOf('aria-label="导出"');
    expect(at, '聚合触发钮在场').toBeGreaterThan(-1);
    const seg = src.slice(Math.max(0, at - 500), at + 500);
    expect(seg).toContain('class="menu-wrap"');
    expect(seg).toContain('aria-haspopup="menu"');
    expect(seg).toContain(':aria-expanded="bwExpOpen"');
    expect(seg).toContain('@click.stop="bwExpOpen = !bwExpOpen"');
    expect(seg, '宿主过滤空=触发钮 disabled（恒在场非消失）').toContain(':disabled="!filtered.length"');
  });

  it('菜单两格式项直达 exportCsv/exportMd 并点击后收口', () => {
    expect(src).toMatch(/role="menu" aria-label="导出索引列表"/);
    expect(src).toContain('exportCsv(); closeBwExp()');
    expect(src).toContain('exportMd(); closeBwExp()');
  });

  it('负锚：平铺 CSV/Markdown 双钮退役（@click 精确旧形态零残留；disabled 接线唯一化）', () => {
    expect(src).not.toMatch(/@click="exportCsv"/);
    expect(src).not.toMatch(/@click="exportMd"/);
    expect(src.match(/:disabled="!filtered\.length"/g)?.length, '空集 disabled 只落聚合触发钮一颗').toBe(1);
  });

  it('浮层四要素（.bw-menu 白底/边框/圆角/阴影）+ 点外/Esc 收口+卸载摘卸', () => {
    expect(src).toMatch(/\.bw-menu\s*\{[^}]*position:\s*absolute/);
    expect(src).toMatch(/\.bw-menu\s*\{[^}]*background:\s*var\(--bg1\)/);
    expect(src).toMatch(/\.bw-menu\s*\{[^}]*border:\s*1px solid var\(--line-strong\)/);
    expect(src).toMatch(/\.bw-menu\s*\{[^}]*border-radius:\s*var\(--r-m\)/);
    expect(src).toMatch(/\.bw-menu\s*\{[^}]*box-shadow:/);
    expect(src, 'menu-wrap 定位壳').toMatch(/\.menu-wrap\s*\{[^}]*position:\s*relative/);
    expect(src, '点外收口（menu-wrap 域外点击即关）').toContain("closest('.menu-wrap')");
    /* 九百五十九批随迁：Esc 收口通道扩深链文档卡（linkedDoc 一并收起），
       closeBwExp() 调用仍在场=菜单收口语义不漂 */
    expect(src, 'Esc 收口').toMatch(/if \(e\.key === 'Escape'\) \{\s*\n\s*linkedDoc\.value = null;\s*\n\s*closeBwExp\(\);\s*\n\s*\}/);
    expect(src).toMatch(/onBeforeUnmount\(\(\) => \{\s*document\.removeEventListener\('click', onDocBwClick\);\s*document\.removeEventListener\('keydown', onDocBwEsc\);\s*\}\)/);
  });
});

describe('九百四十七批 B 行为锁（九百三十六挂载范式）', () => {
  it('平铺双钮退役+聚合触发钮在场；开菜单两格式项可达', async () => {
    await mountBrowser();
    expect(barBtn('CSV'), '平铺 CSV 钮退役').toBeUndefined();
    expect(barBtn('Markdown'), '平铺 Markdown 钮退役').toBeUndefined();
    const trig = barBtn('导出')!;
    expect(trig, '聚合触发钮在场').toBeTruthy();
    expect(trig.getAttribute('aria-haspopup')).toBe('menu');
    expect(trig.disabled, '默认有行集=可用').toBe(false);
    trig.click();
    await settle();
    const menu = host.querySelector('.bw-bar [role="menu"]');
    expect(menu, '菜单展开').toBeTruthy();
    expect(trig.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelectorAll('[role="menuitem"]').length, '两格式项').toBe(2);
  });

  it('CSV 项下载报真+点击后菜单收口；Markdown 项复制报真', async () => {
    const { store } = await mountBrowser();
    const spy = vi.spyOn(store, 'notify');
    barBtn('导出')!.click();
    await settle();
    /* bwQrt 桩在开菜单 settle 之后注入：模板 ref 随重渲染重绑，先注桩会被真实例顶掉 */
    ss().bwQrt = { getCsvBlock: oneRowBlk };
    barBtn('CSV')!.click();
    await settle();
    expect(downloadFn).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('success', expect.stringContaining('已导出'));
    expect(host.querySelector('.bw-bar [role="menu"]'), '点击格式项后菜单收口').toBeNull();
    barBtn('导出')!.click();
    await settle();
    ss().bwQrt = { getCsvBlock: oneRowBlk };
    barBtn('Markdown')!.click();
    await settle();
    expect(spy).toHaveBeenCalledWith('success', expect.stringContaining('Markdown'));
  });

  it('内核级空集：菜单项点击走报真 warning 不静默（九百三十六 backstop 保留）', async () => {
    const { store } = await mountBrowser();
    const spy = vi.spyOn(store, 'notify');
    barBtn('导出')!.click();
    await settle();
    /* 同上：桩注入后置于开菜单 settle */
    ss().bwQrt = { getCsvBlock: emptyBlk };
    barBtn('CSV')!.click();
    await settle();
    expect(spy).toHaveBeenCalledWith('warning', '无表格结果可导出');
  });

  it('Esc 关菜单；点外关菜单', async () => {
    await mountBrowser();
    barBtn('导出')!.click();
    await settle();
    expect(host.querySelector('.bw-bar [role="menu"]')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(host.querySelector('.bw-bar [role="menu"]'), 'Esc 收口').toBeNull();
    barBtn('导出')!.click();
    await settle();
    (host.querySelector('.bw-search') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(host.querySelector('.bw-bar [role="menu"]'), '点外收口').toBeNull();
  });

  it('宿主过滤空：触发钮恒在场 disabled（九百三十六语义不回退）', async () => {
    await mountBrowser();
    ss().kw = 'zzz-no-match';
    await settle();
    const trig = barBtn('导出')!;
    expect(trig, '触发钮恒在场').toBeTruthy();
    expect(trig.disabled).toBe(true);
  });
});
