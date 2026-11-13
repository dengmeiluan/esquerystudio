/**
 * 九百三十六批：导出空集静默假死报真（同动线跨页口径收敛）+工具条工作区钮位置恒定。
 *
 * 矿①：getCsvBlock 空行集（内核列漏斗叠加在宿主过滤之上，可筛至零行）时，
 * Browser/Overview/Diag/Security 四页七处消费点 `if (!blk || !blk.rows.length) return;`
 * 静默退场零反馈——按钮可点而点击无任何响应=假死；同一动线在 LuceneQueryView 已有
 * `notify('warning', '无表格结果可导出')` 报真先例，四页漏对齐=同域两口径。
 * 修法=空集分支补齐同款 warning（对齐既有话术，不造第二措辞）。
 * 矿②：工具条「工作区」钮 v-if="store.pickedIdx" 条件消失——选中态切换时后续
 * CSV/Markdown/新建索引钮位置跳变（位置恒定违例）；无选中应 disabled 而非 v-if
 * 消失（空态结构恒定，无数据 disabled 而非消失）。
 *
 * Browser 行为锚（视图/组件全真，只 mock api/vue-router/format 出口；空行集经
 * setupState 向 bwQrt ref 注入桩）+ Overview/Diag/Security 源码锁（同构缺陷的
 * 静态证据，行为链由 Browser 锚承担）。
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
const viewSrc = (name: string) => readFileSync(join(__dirname, '../views', name), 'utf-8');

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
const emptyBlk = () => ({ head: ['索引', '健康', '状态', '文档数', '存储', '分片', '创建时间'], rows: [] as any[][] });
const oneRowBlk = () => ({ head: ['索引', '健康', '状态', '文档数', '存储', '分片', '创建时间'], rows: [['a-1', 'green', 'open', 1, '1kb', '1/0', 'x']] });

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  rawFn.mockReset().mockResolvedValue({ acknowledged: true });
  downloadFn.mockReset();
});

describe('导出空集报真（Browser 行为锚）', () => {
  it('CSV 空行集（内核漏斗筛空）报 warning 不再静默', async () => {
    const { store } = await mountBrowser();
    const spy = vi.spyOn(store, 'notify');
    /* 九百四十七批随迁：导出双钮合并「导出 ▾」菜单——开菜单 settle 后注入 bwQrt 桩
     （模板 ref 随重渲染重绑，先注桩会被真实例顶掉），再点 CSV 格式项 */
    barBtn('导出')!.click();
    await settle();
    ss().bwQrt = { getCsvBlock: emptyBlk };
    barBtn('CSV')!.click();
    await settle();
    expect(spy).toHaveBeenCalledWith('warning', '无表格结果可导出');
  });

  it('Markdown 空行集报 warning 不再静默', async () => {
    const { store } = await mountBrowser();
    const spy = vi.spyOn(store, 'notify');
    /* 九百四十七批随迁：开菜单 settle 后注桩，再点 Markdown 格式项 */
    barBtn('导出')!.click();
    await settle();
    ss().bwQrt = { getCsvBlock: emptyBlk };
    barBtn('Markdown')!.click();
    await settle();
    expect(spy).toHaveBeenCalledWith('warning', '无表格结果可导出');
  });

  it('非空行集 CSV 正常导出（防过修守卫）', async () => {
    const { store } = await mountBrowser();
    const spy = vi.spyOn(store, 'notify');
    /* 九百四十七批随迁：开菜单 settle 后注桩，再点 CSV 格式项 */
    barBtn('导出')!.click();
    await settle();
    ss().bwQrt = { getCsvBlock: oneRowBlk };
    barBtn('CSV')!.click();
    await settle();
    expect(downloadFn).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('success', expect.stringContaining('已导出'));
  });

  it('宿主过滤空时导出钮 disabled（现状守卫不回退；九百四十七批聚合触发钮恒在场）', async () => {
    await mountBrowser();
    ss().kw = 'zzz-no-match';
    await settle();
    expect(barBtn('导出')!.disabled).toBe(true);
  });
});

describe('工作区钮位置恒定（Browser 行为锚+源码锁）', () => {
  it('未选索引时工作区钮恒在场且 disabled', async () => {
    await mountBrowser();
    const btn = barBtn('工作区');
    expect(btn, '工作区钮在场（不随选中态消失）').toBeTruthy();
    expect(btn!.disabled).toBe(true);
  });

  it('深链选中索引后工作区钮 enabled 且文案带索引名', async () => {
    await mountBrowser('#/browser?idx=orders-v9');
    const btn = barBtn('工作区');
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(false);
    expect(btn!.textContent).toContain('orders-v9');
  });

  it('工具条工作区钮条件渲染退役锁', () => {
    expect(src, 'v-if 条件消失退役').not.toContain('v-if="store.pickedIdx"');
  });
});

describe('同动线跨页口径收敛（Overview/Diag/Security 源码锁）', () => {
  const countOf = (name: string) => (viewSrc(name).match(/无表格结果可导出/g) || []).length;

  it('Overview 监控历史 TSV/Markdown 两处报真', () => {
    expect(countOf('OverviewView.vue')).toBe(2);
  });

  it('Diag 节点表导出双格式入口报真', () => {
    expect(countOf('DiagView.vue')).toBe(1);
  });

  it('Security 审计 TSV/Markdown 两处报真', () => {
    expect(countOf('SecurityView.vue')).toBe(2);
  });
});
