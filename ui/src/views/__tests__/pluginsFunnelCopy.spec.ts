/**
 * 天罗W6 P1：PluginsView raw 表 graft——列筛选漏斗（useColFilters）+ 复制矩阵（copyMatrix TSV）。
 * 五百二十五批 W5 随迁：raw 裸表换 QRT rows 型（cols=node/component/version/description，
 * 与导出 CSV 表头同源），graft 胶水（useColFilters 手挂漏斗/rawKw 快滤/useTableSort/copyMatrix
 * 「TSV」钮）退役，功能由 QRT 内核接管——本文件随迁锁定新终态：
 * 1) QRT 列头内建漏斗（.qrt-funnel）：弹层值清单带每值计数，勾选过滤行集；
 * 2) 双列漏斗 AND 叠加（原「漏斗 AND rawKw」用例语义等价迁移：kw 快滤与漏斗语义重叠，
 *    过滤职责归 QRT 漏斗+Ctrl+F，SystemView 天罗W6 同判据）；
 * 3) TSV 复制矩阵=QRT 内建右键「复制整表（当前页）为 TSV」菜单项；
 * 4) 默认序=拉取序（node-1 优先；QRT 无预置排序，原「默认 name 升序」在此数据下等价）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { allLabels } from '../../__tests__/helpers/ctxMenu'; /* 1142：二级菜单能力面 */
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const NODES = [
  { name: 'node-1', component: 'analysis-ik', version: '7.10.0', description: 'IK 分词器' },
  { name: 'node-1', component: 'analysis-pinyin', version: '7.10.0', description: '拼音分词' },
  { name: 'node-2', component: 'analysis-ik', version: '7.9.0', description: 'IK 分词器旧版' },
];

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      pluginsMatrix: vi.fn(async () => ({
        available: true, reason: '', nodes: NODES, summary: [], mismatches: [],
        nodeCount: 2, pluginCount: 2,
      })),
    },
  };
});

import PluginsView from '../PluginsView.vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountPlugins() {
  document.body.appendChild(host);
  const app = createApp({ render: () => h(PluginsView) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await settle();
  return { app, host };
}

const funnelOf = (label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('table.qrt-tbl thead .qrt-funnel')]
    .find(b => b.getAttribute('aria-label') === label);
const rawRows = () => [...host.querySelectorAll('table.qrt-tbl tbody tr')]
  .filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row'));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
});

describe('PluginsView raw 表 QRT 内核化（天罗W6 graft→五百二十五批 W5 随迁）', () => {
  it('插件列漏斗：弹层值清单+勾选过滤行集（analysis-ik → 2 行）；双列漏斗 AND 叠加', async () => {
    await mountPlugins();
    expect(rawRows().length).toBe(3);
    const funnel = funnelOf('筛选 component 列');
    expect(funnel, '插件列漏斗钮必须渲染').toBeTruthy();
    funnel!.click();
    await settle(6);
    const pop = document.querySelector('.cfp');
    expect(pop, '漏斗弹层（teleport body）').not.toBeNull();
    expect(pop!.textContent).toContain('筛选「component」');
    (pop!.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await settle(6);
    expect(rawRows().length, '勾 analysis-ik（首现值）→ 2 行').toBe(2);
    expect(funnel!.classList.contains('on')).toBe(true);
    /* 双列漏斗 AND：version 漏斗勾首现值 7.10.0 → component=ik AND version=7.10 → 1 行 */
    const vFunnel = funnelOf('筛选 version 列');
    expect(vFunnel, '版本列漏斗钮必须渲染').toBeTruthy();
    vFunnel!.click();
    await settle(6);
    const vPop = document.querySelector('.cfp')!;
    (vPop.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await settle(6);
    expect(rawRows().length, 'AND 后 1 行（node-1 / analysis-ik / 7.10.0）').toBe(1);
    expect(rawRows()[0].textContent).toContain('analysis-ik');
    /* 空态语义等价（原 kw 交叉 0 行）：component 换勾 pinyin → 1 行；version 换勾 7.9.0
       → component=pinyin AND version=7.9 交集为空 → 0 行空态 */
    funnel!.click();
    await settle(6);
    const cPop2 = document.querySelector('.cfp')!;
    const cBoxes = [...cPop2.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    cBoxes[0]!.click(); /* 取消 analysis-ik */
    await settle(4);
    cBoxes[1]!.click(); /* 勾 analysis-pinyin */
    await settle(6);
    expect(rawRows().length, 'pinyin AND 7.10 → 1 行').toBe(1);
    vFunnel!.click();
    await settle(6);
    const vBoxes = [...document.querySelector('.cfp')!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    vBoxes[0]!.click(); /* 取消 7.10.0 */
    await settle(4);
    vBoxes[1]!.click(); /* 勾 7.9.0 */
    await settle(6);
    expect(rawRows().length, 'component=pinyin AND version=7.9 行集为空').toBe(0);
    expect(host.textContent).toContain('筛选条件无匹配行');
    app_unmount_all();
  });

  it('QRT 内建右键菜单含「复制整表（当前页）为 TSV」；默认序=拉取序（node-1 优先）', async () => {
    await mountPlugins();
    /* 默认序（无预置排序=拉取序，此数据下与原「name 升序」等价）：第一行业务格 node-1（首列=序号） */
    expect((rawRows()[0].children[1] as HTMLElement).textContent).toContain('node-1');
    /* TSV 复制矩阵收编 QRT 内建菜单（原卡头「TSV」钮退役）：首行业务格右键 → 菜单项在 */
    const firstTd = rawRows()[0].children[1] as HTMLElement;
    firstTd.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settle(6);
    const menu = document.querySelector('.ccm');
    expect(menu, 'QRT 右键菜单必须弹出').not.toBeNull();
    /* 1142：整表 TSV 住「复制…」二级——展开分组后断言能力面 */
    const labels = await allLabels();
    expect(labels.join(' | '), 'QRT 右键菜单必须含整表 TSV 复制项（内核接管原「数值」/「TSV」钮）')
      .toContain('复制整表（当前页）为 TSV');
    app_unmount_all();
  });
});

function app_unmount_all() {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
}
