/**
 * 天罗W6 P1：HealthReportView 双表 graft——不健康索引表 + 节点负载表 聚合 footer 行 +
 * 数值列复制矩阵；idxKw 过滤保留；reason 接 reasonZh 人话 + meta-warn 档。
 * 五百二十五批 W5 随迁：双裸表换 QRT rows 型（storageKey=health:unhealthy / health:nodes，
 * 与 graft 期 es_tbl_agg:health:* 落盘键无缝兼容），graft 胶水（「Σ 聚合」开关钮/useColStats
 * tfoot/copyMatrix「数值」钮/idxKw 快滤框）退役，功能由 QRT 内核接管——本文件随迁锁定新终态：
 * 1) 列头右键菜单「聚合行」开关双表独立：出 tfoot.qrt-agg-row（内核采样口径 Σ/avg，数值列
 *    Number 化后与 graft 期 isNumeric:()=>true 强制口径等价；size '1kb' 带单位串保持字符串
 *    自动出局 Σ）+ es_tbl_agg:health:* 落盘、重挂载恢复；
 * 2) 数值复制矩阵=QRT 内建右键「复制整表（当前页）为 TSV」菜单项；
 * 3) index 列漏斗与聚合共存（原 idxKw 语义等价迁移：过滤职责归 QRT 漏斗+Ctrl+F，
 *    SystemView 天罗W6 同判据）；
 * 4) reason NODE_LEFT → 出人话 + meta-warn；can_allocate=no → meta-err（esEnumZh 收口口径）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toggleViewSwitch } from '../../__tests__/helpers/viewSwitch'; /* 1143 */
import { allLabels } from '../../__tests__/helpers/ctxMenu'; /* 1142：二级菜单能力面 */
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const REPORT = {
  score: 60, generatedAt: '2026-09-18T00:00:00Z',
  summary: { status: 'yellow', unassigned: 1, pending: 0, unhealthyIndices: 2, nodes: 2, hotNodes: 0 },
  checks: [{ level: 'warn', name: 'unassigned', message: '存在未分配分片' }],
  unhealthyIndices: [
    { index: 'order-2026.01', health: 'red', pri: 1, rep: 1, 'docs.count': 5, 'store.size': '1kb' },
    { index: 'web-2026.02', health: 'yellow', pri: 2, rep: 0, 'docs.count': 3, 'store.size': '2kb' },
  ],
  nodes: [
    { name: 'n-a', 'heap.percent': 80, cpu: 40, load_1m: 1, 'disk.used_percent': 50, 'ram.percent': 60 },
    { name: 'n-b', 'heap.percent': 40, cpu: 20, load_1m: 0.5, 'disk.used_percent': 30, 'ram.percent': 50 },
  ],
  allocationExplain: { unassigned_info: { reason: 'NODE_LEFT' }, can_allocate: 'no' },
};

const healthReportFn = vi.fn();

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      healthReport: (...a: any[]) => healthReportFn(...a),
    },
  };
});

import HealthReportView from '../HealthReportView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountHr() {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(HealthReportView) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

async function runReport(host: HTMLElement) {
  const runBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.hr-hd-r button'))
    .find(b => b.textContent?.includes('开始体检'));
  expect(runBtn, '开始体检按钮必须渲染').toBeTruthy();
  runBtn!.click();
  await settle(8);
}

function sectionOf(host: HTMLElement, title: string): HTMLElement {
  const sec = [...host.querySelectorAll<HTMLElement>('.hr-sec')]
    .find(s => (s.querySelector('.hr-sec-hd')?.textContent || '').includes(title));
  expect(sec, `分节「${title}」必须渲染`).toBeTruthy();
  return sec!;
}

/* 列头右键 → QRT 列管理菜单（.ccm）→ 点「聚合行」开关 */
/* 1143：聚合行是表格级视图开关，入口已归位工具行「视图 ⋯」；
   页内两张表各有一颗「视图 ⋯」，按钮查找必须限定在本表分节内
   （document 级查找会命中最上面那张表，开关落到错表上）。 */
async function toggleAggViaViewMenu(sec: HTMLElement, _col?: string) {
  const ok = await toggleViewSwitch('聚合行', sec);
  expect(ok, '本表「视图 ⋯」里聚合行开关必须可达').toBe(true);
  await settle(6);
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  location.hash = '#/';
  healthReportFn.mockReset().mockResolvedValue(REPORT);
});

describe('HealthReportView 双表 QRT 内核化（天罗W6 graft→五百二十五批 W5 随迁）', () => {
  it('不健康索引表：列头菜单「聚合行」出 tfoot（pri Σ3·avg1.50 / docs Σ8·avg4.00）+ 落盘 health:unhealthy', async () => {
    const { app, host } = await mountHr();
    await runReport(host);
    const sec = sectionOf(host, '不健康索引');
    expect(sec.querySelector('tfoot'), '默认关闭不出 tfoot').toBeNull();
    /* 原卡头「数值」钮随内核化退役，复制矩阵=QRT 内建右键「复制整表（当前页）为 TSV」菜单项 */
    const firstTd = sec.querySelector('table.qrt-tbl tbody tr td:nth-child(2)') as HTMLElement;
    firstTd.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settle(6);
    const cellMenu = document.querySelector('.ccm');
    expect(cellMenu, '单元格右键菜单必须弹出').not.toBeNull();
    /* 1142：整表 TSV 住「复制…」二级——展开分组后断言能力面 */
    const labels = await allLabels();
    expect(labels.join(' | '), '整表 TSV 复制项在（内核接管原「数值」钮）')
      .toContain('复制整表（当前页）为 TSV');
    /* helper 展开了分组二级：直接摘除菜单节点（Esc 两段语义下需两下，此处不测 Esc） */
    document.querySelectorAll('.ccm-mask').forEach(n => n.remove());
    await settle(4);
    await toggleAggViaViewMenu(sec, 'pri');
    const tfoot = sec.querySelector('tfoot tr.qrt-agg-row');
    expect(tfoot, '开启后 tfoot 渲染').toBeTruthy();
    expect(tfoot!.textContent, 'pri Σ/avg（内核 fmtNum + toFixed(2) 格式）').toContain('Σ 3 · avg 1.50');
    expect(tfoot!.textContent, 'docs Σ/avg').toContain('Σ 8 · avg 4.00');
    expect(localStorage.getItem('es_tbl_agg:health:unhealthy')).toBe('1');
    app.unmount();
  });

  it('节点负载表：聚合出 tfoot（heap Σ120·avg60.00）+ 落盘 health:nodes；与不健康表开关互不牵连', async () => {
    const { app, host } = await mountHr();
    await runReport(host);
    const ndSec = sectionOf(host, '节点负载');
    const uxSec = sectionOf(host, '不健康索引');
    await toggleAggViaViewMenu(ndSec, "heap%");
    expect(ndSec.querySelector('tfoot tr.qrt-agg-row')!.textContent).toContain('Σ 120 · avg 60.00');
    expect(localStorage.getItem('es_tbl_agg:health:nodes')).toBe('1');
    expect(uxSec.querySelector('tfoot'), '不健康表开关未动，不出 tfoot').toBeNull();
    app.unmount();
  });

  it('index 列漏斗与聚合共存：漏斗勾选后只剩 1 行，tfoot Σ 只算所见集', async () => {
    const { app, host } = await mountHr();
    await runReport(host);
    const sec = sectionOf(host, '不健康索引');
    const funnel = [...sec.querySelectorAll<HTMLButtonElement>('table.qrt-tbl thead .qrt-funnel')]
      .find(b => b.getAttribute('aria-label') === '筛选 index 列');
    expect(funnel, 'index 列漏斗钮必须渲染').toBeTruthy();
    funnel!.click();
    await settle(6);
    const pop = document.querySelector('.cfp');
    expect(pop, '漏斗弹层（teleport body）').not.toBeNull();
    expect(pop!.textContent).toContain('筛选「index」');
    (pop!.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await settle(6);
    /* 勾首现值 order-2026.01 → 只剩 1 行（原 idxKw='order' 同集）；QRT 计数条明示 1/2 */
    const rows = [...sec.querySelectorAll('table.qrt-tbl tbody tr')]
      .filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row'));
    expect(rows.length, '漏斗过滤后 1 行').toBe(1);
    expect(sec.querySelector('.qrt-bar')!.textContent).toContain('1/2');
    await toggleAggViaViewMenu(sec, 'pri');
    const tfoot = sec.querySelector('tfoot tr.qrt-agg-row')!;
    expect(tfoot.textContent, '聚合只算过滤后 1 行（pri Σ=1）').toContain('Σ 1 · avg 1.00');
    app.unmount();
  });

  it('reason 接 reasonZh（NODE_LEFT 出人话 + meta-warn）；can_allocate=no 挂 meta-err', async () => {
    const { app, host } = await mountHr();
    await runReport(host);
    const warnSpan = host.querySelector('.hr-alloc-line .meta-warn');
    expect(warnSpan, 'reason 裸码挂 meta-warn 档').toBeTruthy();
    expect(warnSpan!.textContent).toBe('NODE_LEFT');
    expect(host.textContent).toContain('原节点离开，分片待重新分配');
    const errSpan = [...host.querySelectorAll('.hr-alloc-line .mono')].find(s => s.textContent === 'no');
    expect(errSpan, 'can_allocate 值渲染').toBeTruthy();
    expect(errSpan!.classList.contains('meta-err'), 'no → meta-err 档').toBe(true);
    app.unmount();
  });
});
