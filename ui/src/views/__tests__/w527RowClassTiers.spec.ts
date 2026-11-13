/**
 * 五百二十七批 W-F：行级色档消费 + 编辑器视口档 + 展示数字档 随迁锚。
 *
 * 契约（内核 rowClass prop 由并行工蚁 W-D 落地：返回 class 追加到 tr）：
 * ① DiagView 节点表：HEAP% ≥ bad(85) 或 CPU% ≥ bad(90) → 'dg-node-warn'（语义类名承 200 批原档，
 *    CSS 定义留 DiagView scoped :deep）；阈值单一真源 METRIC_THRESHOLDS（不回自造阈值）。
 * ② HealthReportView 节点表：heap/cpu/disk 三列过 metricTone 阈值表，bad→'hr-row-hot'、
 *    warn→'hr-row-warm'（多列取最严重档；hotCls 语义行级回收）。
 * ③ SystemView DSL 编辑器 150px 定高 → 视口弹性档 max(150px, 28vh)（526 批 42vh 档范式，保底不降）。
 * ④ HealthReportView 补 1100 堆叠档（此前仅 900 倒挂）；900 保留紧凑微调。
 * ⑤ 展示数字档：BulkEditorView 21px→var(--fs-num)、WorkspaceView 28px→var(--fs-num-l)；
 *    OverviewView 11px KPI 数字档有据放弃（KPI 卡墙 525 批已退役）并以「不回流」守卫锁死。
 *
 * 行为级：QueryResultTable 以 stub 捕获 rowClass prop 直接调用验证（不依赖内核渲染落地；
 * 内核就绪后 Lead 终验 tr class 追加）。源码锁部分与 diagCpuTrend 同范式。
 * 设施：vue-router 内存路由 + api spy 注入（diagTableAgg 同范式）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick, defineComponent } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const nodesStatsFn = vi.fn();
const healthReportFn = vi.fn();

/* stub QRT：透传 props 并捕获 rowClass（真内核渲染不在本网范围，W-D 落地后 Lead 终验 tr 追加） */
let capturedRowClass: ((row: any[], index: number) => string | undefined) | null = null;
vi.mock('../../components/QueryResultTable.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['cols', 'rows', 'sortable', 'storageKey', 'fieldTypes', 'maxHeight', 'emptyText', 'rowClass'],
      setup(props: any) {
        capturedRowClass = props.rowClass ?? null;
        return () => h('div', { class: 'qrt-stub' });
      },
    }),
  };
});

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      health: vi.fn(async () => ({ locks: { self: 0, other: 0, expired: 0 } })),
      clusterHealth: vi.fn(async () => ({ status: 'green', number_of_nodes: 2, number_of_data_nodes: 2, active_primary_shards: 3 })),
      nodesStats: (...a: any[]) => nodesStatsFn(...a),
      pendingTasks: vi.fn(async () => ({ tasks: [] })),
      allocationExplain: vi.fn(async () => { throw new Error('not probed'); }),
      healthReport: (...a: any[]) => healthReportFn(...a),
    },
  };
});

import DiagView from '../DiagView.vue';
import HealthReportView from '../HealthReportView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any) {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

const srcOf = (f: string) => readFileSync(join(__dirname, '..', f), 'utf-8');

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  location.hash = '#/';
  capturedRowClass = null;
  nodesStatsFn.mockReset().mockResolvedValue([]);
  healthReportFn.mockReset().mockRejectedValue(new Error('not run'));
});

describe('五百二十七批 W-F：DiagView 节点表行级警告色档（rowClass 契约消费）', () => {
  it('高负载行判档：heap≥85 或 cpu≥90 → dg-node-warn；未过阈/空值 → undefined', async () => {
    nodesStatsFn.mockResolvedValue([
      { name: 'n-hot', nodeId: 'a1', roles: ['data'], heapPct: 90, cpuPct: 30 },
      { name: 'n-cpu', nodeId: 'a2', roles: ['data'], heapPct: 50, cpuPct: 91 },
      { name: 'n-ok', nodeId: 'a3', roles: ['data'], heapPct: 80, cpuPct: 89 },
    ]);
    const { app } = await mountView(DiagView);
    expect(capturedRowClass, '节点表必须传 rowClass（QRT rowClass 契约）').toBeTypeOf('function');
    const fn = capturedRowClass!;
    /* 列序 [节点, 角色, HEAP%, HEAP 趋势, CPU%, …]（索引 2/4） */
    expect(fn(['n-hot', 'data', 90, '采样中', 30, '采样中', 1, 1024, 0, 0], 0), 'heap 90 ≥ bad(85) → 警告行').toBe('dg-node-warn');
    expect(fn(['n-cpu', 'data', 50, '采样中', 91, '采样中', 1, 1024, 0, 0], 1), 'cpu 91 ≥ bad(90) → 警告行').toBe('dg-node-warn');
    expect(fn(['n-ok', 'data', 80, '采样中', 89, '采样中', 1, 1024, 0, 0], 2), 'heap 80 / cpu 89 未过 bad 阈 → 不挂档').toBeUndefined();
    expect(fn(['n-null', 'data', null, '采样中', null, '采样中', 1, 1024, 0, 0], 3), '空值行不误报').toBeUndefined();
    app.unmount();
  });

  it('源码锁：阈值单一真源 METRIC_THRESHOLDS + 语义类名 + scoped :deep 皮在场', () => {
    const s = srcOf('DiagView.vue');
    expect(s, '节点表 QRT 必须传 :row-class').toContain(':row-class="ndRowClass"');
    expect(s, '阈值走单一真源（heap bad）').toMatch(/METRIC_THRESHOLDS\.heap\.bad/);
    expect(s, '阈值走单一真源（cpu bad）').toMatch(/METRIC_THRESHOLDS\.cpu\.bad/);
    expect(s, '语义类名承 200 批原档').toContain("'dg-node-warn'");
    expect(s, '行皮留在本视图 scoped（tr 由内核渲染 :deep 穿透）').toMatch(/\.dg :deep\(\.dg-node-warn td\)\s*\{\s*background:\s*var\(--warn-soft\);?\s*\}/);
  });
});

describe('五百二十七批 W-F：HealthReportView 节点表水位行色档（hotCls 语义回收）', () => {
  const REPORT = {
    score: 80, generatedAt: '2026-09-19T10:00:00Z',
    summary: { status: 'yellow', unassigned: 0, pending: 0, unhealthyIndices: 0, nodes: 3, hotNodes: 2 },
    checks: [],
    nodes: [
      { name: 'n-hot', 'heap.percent': 92, cpu: 30, 'load_1m': 1, 'disk.used_percent': 50, 'ram.percent': 60 },
      { name: 'n-warm', 'heap.percent': 50, cpu: 80, 'load_1m': 1, 'disk.used_percent': 85, 'ram.percent': 60 },
      { name: 'n-ok', 'heap.percent': 50, cpu: 30, 'load_1m': 1, 'disk.used_percent': 50, 'ram.percent': 60 },
    ],
  };

  it('水位行判档：bad 列 → hr-row-hot；仅 warn 列 → hr-row-warm；多列取最严重档', async () => {
    /* R51：最近一次体检落 sessionStorage，挂载即复原（数据无需真跑 run） */
    sessionStorage.setItem('esquerystudio.health-report.last', JSON.stringify(REPORT));
    const { app } = await mountView(HealthReportView);
    expect(capturedRowClass, '节点负载表必须传 rowClass（QRT rowClass 契约）').toBeTypeOf('function');
    const fn = capturedRowClass!;
    /* 列序 [name, heap%, cpu%, load 1m, disk%, ram%]（索引 1/2/4） */
    expect(fn(['n-hot', 92, 30, 1, 50, 60], 0), 'heap 92 ≥ bad(85) → hot 行').toBe('hr-row-hot');
    expect(fn(['n-warm', 50, 80, 1, 85, 60], 1), 'cpu/disk 仅 warn 档 → warm 行').toBe('hr-row-warm');
    expect(fn(['n-ok', 50, 30, 1, 50, 60], 2), '全列未过阈 → 不挂档').toBeUndefined();
    expect(fn(['n-mix', 92, 80, 1, 85, 60], 3), 'bad+warn 并存取最严重档 hot').toBe('hr-row-hot');
    app.unmount();
  });

  it('源码锁：三列 metricTone 阈值 + hot/warm 语义类名 + 行皮 + rowClass 传参在场', () => {
    const s = srcOf('HealthReportView.vue');
    expect(s, '节点负载表 QRT 必须传 :row-class').toContain(':row-class="ndRowClass"');
    for (const m of ['heap', 'cpu', 'disk']) {
      expect(s, `metricTone('${m}') 三列同源阈值`).toMatch(new RegExp("metricTone\\('" + m + "'"));
    }
    expect(s).toContain("'hr-row-hot'");
    expect(s).toContain("'hr-row-warm'");
    expect(s, 'hot 行皮（err 柔底）在场').toMatch(/\.hr-body :deep\(\.hr-row-hot td\)\s*\{[^}]*--err-soft/);
    expect(s, 'warm 行皮（warn 柔底）在场').toMatch(/\.hr-body :deep\(\.hr-row-warm td\)\s*\{[^}]*--warn-soft/);
  });

  it('1100 堆叠档补齐（900 倒挂修复）：hero 纵向堆叠 + 摘要 3→2 列；900 紧凑微调保留', () => {
    const s = srcOf('HealthReportView.vue');
    expect(s, '1100 档在场（hero 堆叠）').toMatch(/@media \(max-width: 1100px\)\s*\{[^}]*\.hr-hero\s*\{\s*flex-direction:\s*column;/s);
    expect(s, '1100 档 hero 摘要 3→2 列').toMatch(/@media \(max-width: 1100px\)\s*\{[\s\S]*\.hr-hero-r\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
    expect(s, '900 紧凑微调档保留').toMatch(/@media \(max-width: 900px\)\s*\{[^}]*\.hr-hero-r\s*\{\s*grid-template-columns:\s*1fr;/s);
  });
});

describe('五百二十七批 W-F：SystemView 编辑器视口档（§6n 150px 定高遗留）', () => {
  it('DSL 编辑器 150px 定高 → max(150px, 28vh) 弹性档（保底不降、大屏吃视口）', () => {
    const s = srcOf('SystemView.vue');
    /* 五百七十三批字面随迁：530 批把静态 height 收编 useTierCycle 三档循环（st.editorH 范式），
       静态字面退役换 :height="sysEdH" 档位绑定；首档沿用原口径（SYS_ED_H_TIERS[0] 恰为原
       弹性档），判别力随迁=档位绑定锚+首档等值锚+定高不回流不变 */
    expect(s, 'sysEdH 档位绑定在场').toContain(':height="sysEdH"');
    expect(s, '首档沿用原 max(150px, 28vh) 口径零变化').toMatch(/SYS_ED_H_TIERS = \['max\(150px, 28vh\)'/);
    expect(s, '150px 定高不回流').not.toContain('height="150px"');
  });
});

describe('五百二十七批 W-F：展示数字档（--fs-num 体系收编）', () => {
  it('BulkEditorView 结果大数字 21px → var(--fs-num)', () => {
    const s = srcOf('BulkEditorView.vue');
    expect(s).toMatch(/\.be-result-num\s*\{[^}]*font-size:\s*var\(--fs-num\)/);
    expect(s, '21px 字面量不回流').not.toMatch(/\.be-result-num\s*\{[^}]*21px/);
  });

  it('WorkspaceView 大数字 28px → var(--fs-num-l)（ws-score 与 ws-num 双处）', () => {
    const s = srcOf('WorkspaceView.vue');
    expect(s.match(/var\(--fs-num-l\)/g)?.length ?? 0, '两处大数字全部收编').toBeGreaterThanOrEqual(2);
    expect(s, '28px 字面量不回流').not.toContain('font-size: 28px');
  });

  it('OverviewView：11px KPI 数字档有据放弃（KPI 卡墙已退役）且不回流', () => {
    const s = srcOf('OverviewView.vue');
    expect(s, '11px 数字档不得回流（MetaStrip 组件承担值档）').not.toMatch(/font-size:\s*11px/);
  });
});
