/**
 * 天罗W6 P1：BrowserView 索引列表 graft——health/status 等值漏斗 + 整列复制（列头复制范式）。
 * 五百二十九批反转随迁：裸表换 QRT rows 型——漏斗（列头内建）/排序/暗状态提示归内核，
 * 「复制整列值」入口平移到 QRT 列头右键菜单（内核 copy-col-vals 项，同语义）。
 * 锁定：
 * 1) health 列漏斗：弹层值清单（green/yellow/red + 每值计数），勾 red → 只剩 red 索引；
 * 2) status 列漏斗：勾 close → 只剩 close 索引；
 * 3) 「复制整列值」在 QRT 列头右键菜单可达（copyMatrix TSV，表头行必含，行集=漏斗前所见）；
 * 4) 暗状态提示「已筛选 N 列」+ ✕ 一键全清恢复（QRT 工具行 .qrt-filtered 内建）；
 * 5) 漏斗与搜索 kw/健康 tab AND 叠加（kw 留视图作 rows 输入端）语义不变。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('vue-router', () => ({ useRouter: () => undefined, useRoute: () => ({ path: '/browser', query: {} }) }));

const INDICES = [
  { index: 'app-a', health: 'green', status: 'open', 'docs.count': 10, 'store.size': '1mb', pri: 1, rep: 1 },
  { index: 'app-b', health: 'yellow', status: 'open', 'docs.count': 20, 'store.size': '2mb', pri: 2, rep: 1 },
  { index: 'bad-c', health: 'red', status: 'close', 'docs.count': 30, 'store.size': '3mb', pri: 3, rep: 0 },
];

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve(INDICES),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import BrowserView from '../BrowserView.vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountBrowser() {
  document.body.appendChild(host);
  const app = createApp({ setup: () => () => h(BrowserView as any) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  /* loadIndices 链（ensureSetup→clusterIndices→overview/clusterHealth 后续尾巴）多轮微任务 */
  for (let i = 0; i < 20; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  /* useUrlState writeBack 会把上一用例的 kw/health 写进 location.hash——逐用例复位防串场 */
  location.hash = '#/browser';
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
});

/* 五百二十九批锚随迁：table.tbl thead .bw-f-btn → QRT 内建 thead .qrt-funnel；
   aria 同字（列名中文键「筛选 健康 列」） */
const funnelOf = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('table.qrt-tbl thead .qrt-funnel')]
    .find(b => b.getAttribute('aria-label') === label);
/* 锚随迁：table.tbl tbody tr → QRT table.qrt-tbl tbody tr（剔除 .qrt-nomatch 提示行） */
const bodyRows = () => [...host.querySelectorAll('table.qrt-tbl tbody tr')]
  .filter(tr => !tr.classList.contains('qrt-nomatch'));
/* happy-dom 的 label 激活会延后二次派发 click（勾选又被反转）——直接派发 change 走
   Vue @change 处理器（处理器按 colFilters 现态取反，不读 DOM checked） */
const check = (box: HTMLInputElement) => box.dispatchEvent(new Event('change'));
/* 锚随迁：.bw-foot 已筛选提示 → QRT 工具行 .qrt-filtered（内核暗状态可见性，同文案） */
const footText = () => host.querySelector('.qrt-filtered')?.textContent || '';

describe('BrowserView 索引列表漏斗+整列复制（天罗W6 → 529 QRT 换壳）', () => {
  it('health 漏斗：弹层值清单带计数；勾 red → 只剩 bad-c；「复制整列值」在列头右键菜单', async () => {
    await mountBrowser();
    expect(bodyRows().length).toBe(3);
    const funnel = funnelOf('筛选 健康 列');
    expect(funnel, 'health 列漏斗钮必须渲染').toBeTruthy();
    funnel!.click();
    await settle(6);
    const pop = document.querySelector('.cfp');
    expect(pop, '漏斗弹层（teleport body）').not.toBeNull();
    const vals = [...pop!.querySelectorAll('.cfp-val')].map(s => s.textContent?.trim());
    expect(vals).toEqual(['green', 'yellow', 'red']);
    check(pop!.querySelector('input[type="checkbox"]') as HTMLInputElement);
    await settle(6);
    expect(bodyRows().length, '勾 green → 只剩 app-a 一行').toBe(1);
    expect(bodyRows()[0].textContent).toContain('app-a');
    /* 再勾 red → green+red 两行（名称升序 app-a, bad-c） */
    check(pop!.querySelectorAll('input[type="checkbox"]')[2] as HTMLInputElement);
    await settle(6);
    expect(bodyRows().length).toBe(2);
    expect(bodyRows().map(r => r.querySelector('.bw-name')?.textContent)).toEqual(['app-a', 'bad-c']);
    expect(funnel!.classList.contains('on')).toBe(true);
    /* 五百二十九批锚随迁：弹层底栏「复制整列值」→ QRT 列头右键菜单 copy-col-vals 项
       （copyMatrix TSV，表头行必含，行集=过滤后所见） */
    const th = [...host.querySelectorAll<HTMLTableCellElement>('table.qrt-tbl thead th')]
      .find(t => t.dataset.col === '健康')!;
    th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
    await settle(6);
    const ccm = document.querySelector('.ccm-mask');
    expect(ccm, '列头右键=列管理菜单').not.toBeNull();
    expect(ccm!.textContent).toContain('复制整列值');
    await app_close();
  });

  it('status 漏斗：勾 close → 只剩 close 索引；与 kw 搜索 AND 叠加', async () => {
    await mountBrowser();
    funnelOf('筛选 状态 列')!.click();
    await settle(6);
    const pop = document.querySelector('.cfp')!;
    const boxes = [...pop.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    /* 值序=首现序 open,open,close → 去重 [open(2), close(1)]，勾第 2 个=close */
    check(boxes[1]);
    await settle(6);
    expect(bodyRows().length, 'status=close → 只剩 bad-c').toBe(1);
    expect(bodyRows()[0].textContent).toContain('bad-c');
    /* kw 与漏斗 AND：kw=app 命中的都是 open → 被 close 漏斗筛空 → 内核「已筛选」提示 */
    const kw = host.querySelector<HTMLInputElement>('input[placeholder="搜索索引名…"]');
    kw!.value = 'app';
    kw!.dispatchEvent(new Event('input'));
    await settle();
    expect(bodyRows().length, '漏斗(close) AND kw(app) → 空集').toBe(0);
    expect(footText()).toContain('已筛选 1 列');
    await app_close();
  });

  it('「已筛选」暗状态提示 + ✕ 一键全清恢复全量（QRT 工具行内建）', async () => {
    await mountBrowser();
    expect(host.querySelector('.qrt-filtered')).toBeNull();
    funnelOf('筛选 健康 列')!.click();
    await settle(6);
    check(document.querySelector('.cfp input[type="checkbox"]') as HTMLInputElement);
    await settle(6);
    expect(footText()).toContain('已筛选 1 列');
    expect(bodyRows().length, '勾 green 后只剩 1 行').toBe(1);
    (host.querySelector('.qrt-filtered-clear') as HTMLButtonElement).click();
    await settle(6);
    await settle(12); /* 全清→表格重渲观测窗 */
    expect(bodyRows().length, '全清恢复 3 行').toBe(3);
    expect(host.querySelector('.qrt-filtered')).toBeNull();
    await app_close();
  });
});

async function app_close() {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.ccm-mask,.cfp-mask').forEach(m => m.remove());
}
