/**
 * 天罗W6 P1：DiagView 节点表 graft——聚合 footer 行 + 数值列复制矩阵 + 角色 chip。
 * 五百二十五批 W5 随迁：节点表换 QRT rows 型（storageKey=diag:nodes，与 graft 期
 * es_tbl_agg:diag:nodes 落盘键无缝兼容），graft 胶水（「Σ 聚合行」开关钮/useColStats tfoot/
 * copyNodesMatrix「数值」钮/角色 chip）退役，功能由 QRT 内核接管——本文件随迁锁定新终态：
 * 1) 列头右键菜单「聚合行」开关：出 tfoot.qrt-agg-row（数值列 Σ/avg，内核采样口径），
 *    es_tbl_agg:diag:nodes 落盘，重挂载恢复；
 * 2) 数值复制矩阵=QRT 内建右键「复制整表（当前页）为 TSV」菜单项；
 * 3) 角色列=全量角色串纯文本（原 chip 分档色标随纯文本壳退役，信息保全优先）；
 * 4) can_allocate 三档徽标（esEnumZh.canAllocateCls）：no→meta-err + reason 人话（reasonZh）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toggleViewSwitch } from '../../__tests__/helpers/viewSwitch'; /* 1143 */
import { allLabels } from '../../__tests__/helpers/ctxMenu'; /* 1142：二级菜单能力面 */
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const NODES = [
  { name: 'n-data', nodeId: 'a1', roles: ['master', 'data', 'ingest'], heapPct: 50, cpuPct: 20, load1: 1.5, fsAvailableBytes: 1024 * 1024 * 1024, searchRejected: 0, bulkRejected: 2 },
  { name: 'n-master', nodeId: 'a2', roles: ['master'], heapPct: 80, cpuPct: 40, load1: 0.5, fsAvailableBytes: 1024, searchRejected: 3, bulkRejected: 0 },
];
const ALLOC = { index: 'idx-a', shard: 0, primary: false, current_state: 'unassigned', can_allocate: 'no', unassigned_info: { reason: 'NODE_LEFT' } };

const nodesStatsFn = vi.fn();
const allocationFn = vi.fn();

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      health: vi.fn(async () => ({ locks: { self: 0, other: 0, expired: 0 } })),
      clusterHealth: vi.fn(async () => ({ status: 'green', number_of_nodes: 2, active_primary_shards: 3 })),
      nodesStats: (...a: any[]) => nodesStatsFn(...a),
      pendingTasks: vi.fn(async () => ({ tasks: [] })),
      allocationExplain: (...a: any[]) => allocationFn(...a),
    },
  };
});

import DiagView from '../DiagView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountDiag() {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(DiagView) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

const AGG_KEY = 'es_tbl_agg:diag:nodes';

/* 列头右键 → QRT 列管理菜单（.ccm）→ 点「聚合行」开关 */
/* 1143：聚合行是表格级视图开关，入口已归位工具行「视图 ⋯」 */
async function toggleAggViaViewMenu(_sec: HTMLElement, _col?: string) {
  const ok = await toggleViewSwitch('聚合行', document);
  expect(ok, '「视图 ⋯」里聚合行开关必须可达').toBe(true);
  await settle(6);
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  location.hash = '#/';
  nodesStatsFn.mockReset().mockResolvedValue(NODES);
  allocationFn.mockReset().mockRejectedValue(new Error('not probed yet'));
});

describe('DiagView 节点表 QRT 内核化（天罗W6 graft→五百二十五批 W5 随迁）', () => {
  it('默认无 tfoot；列头菜单「聚合行」出聚合行（heap Σ130·avg65.00 内核口径）并落盘；重挂载恢复', async () => {
    const { app, host } = await mountDiag();
    expect(host.querySelector('tfoot'), '默认关闭不出 tfoot').toBeNull();
    await toggleAggViaViewMenu(host);
    const tfoot = host.querySelector('tfoot tr.qrt-agg-row');
    expect(tfoot, '开启后 tfoot 渲染').toBeTruthy();
    expect(tfoot!.textContent, 'heap 列 Σ/avg（内核 fmtNum + toFixed(2) 格式）').toContain('Σ 130 · avg 65.00');
    expect(localStorage.getItem(AGG_KEY)).toBe('1');
    app.unmount();

    /* 重挂载：落盘恢复，tfoot 直接在（es_tbl_agg:diag:nodes 与 graft 期同键） */
    const app2 = await (async () => { const r = await mountDiag(); return r; })();
    expect(app2.host.querySelector('tfoot tr.qrt-agg-row'), '重挂载按落盘恢复 tfoot').toBeTruthy();
    app2.app.unmount();
  });

  it('QRT 内建右键菜单含「复制整表（当前页）为 TSV」（接管原「数值」钮）；角色列=全量角色串', async () => {
    const { app, host } = await mountDiag();
    const firstTd = host.querySelector('table.qrt-tbl tbody tr td:nth-child(2)') as HTMLElement;
    firstTd.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settle(6);
    const menu = document.querySelector('.ccm');
    expect(menu, '单元格右键菜单必须弹出').not.toBeNull();
    /* 1142：整表 TSV 住「复制…」二级——helper 展开分组后断言能力面 */
    const labels = await allLabels();
    expect(labels.join(' | '), '整表 TSV 复制项在（内核接管原「数值」钮）')
      .toContain('复制整表（当前页）为 TSV');
    /* 角色列：全量角色串纯文本（chip 分档色标退役、信息保全） */
    const rows = [...host.querySelectorAll('table.qrt-tbl tbody tr')];
    expect((rows[0].children[2] as HTMLElement).textContent!.trim()).toBe('master/data/ingest');
    expect((rows[1].children[2] as HTMLElement).textContent!.trim()).toBe('master');
    app.unmount();
  });

  it('allocation explain：can_allocate=no 挂 meta-err 档；reason 出 reasonZh 人话', async () => {
    allocationFn.mockResolvedValue(ALLOC);
    const { app, host } = await mountDiag();
    const probe = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('title') === '分析未分配分片');
    expect(probe, '探测钮必须渲染').toBeTruthy();
    probe!.click();
    await settle(8);
    const can = [...host.querySelectorAll('span')].find(s => s.textContent === 'no');
    expect(can, 'can_allocate 值渲染').toBeTruthy();
    expect(can!.classList.contains('meta-err'), 'no → meta-err 档').toBe(true);
    expect(host.textContent).toContain('原节点离开，分片待重新分配');
    app.unmount();
  });
});
