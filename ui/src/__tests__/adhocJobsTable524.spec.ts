/**
 *  W1：三页表格内核能力补齐（结构锁走源码正则——同 xmigrateSortA11y/口径；
 * 行为锁挂真组件——同 xmigrateSortMemory/sqlBridgeMonaco/adhocStateMachine 最小 mock 面）。
 *
 * T1 AdhocRebuild 最近作业表：工具行 kw 过滤（jobId/逻辑名/状态，命中 MarkText 高亮）
 *    + 状态 pill 漏斗（点状态只看该状态，再点取消）+ matrixText TSV/MD 复制（Xmigrate 同手法）；
 * T2 AdhocRebuild 轮次表 tfoot Σ（Σcreated/Σupdated/ΣversionConflicts，dg-agg 同语言）；
 * T3 Xmigrate 作业表：sortedJobs 过滤并轨（status/destIndex/sourceIndex）+ 工具行 kw
 *    + tfoot Σ（作用于过滤后集合）+ .xm-drop z 档位注释（局部层级不硬归 --z-* token）；
 * T4 SqlBridge 试跑结果真表格（表头=cols/行=lastRows 前 20 行/es_tbl_sem 口径语义显示层）
 *    + matrixText 三格式复制（TSV/MD/JSON）+「仅预览前 20 行」明示。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── 共享 api mock 面：vi.hoisted 持 vi.fn，各 describe 自定 impl（模块 mock 每文件一份） ── */
const mocks = vi.hoisted(() => ({
  adhocJobs: vi.fn(),
  adhocStatus: vi.fn(),
  xbJobs: vi.fn(),
  sqlLenient: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      adhoc: { ...orig.api.adhoc, jobs: mocks.adhocJobs, status: mocks.adhocStatus },
      xb: { ...orig.api.xb, jobs: mocks.xbJobs, destIndices: async () => [] },
      sqlLenient: mocks.sqlLenient,
    },
  };
});

/* MonacoEditor 组件 stub：setup 捕获入档（SqlBridge 用 emit 驱动 sql 输入；Adhoc/JsonArea 兼容裸 stub） */
const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountView(View: any) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(View) });
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

const setInput = async (el: Element, v: string) => {
  (el as HTMLInputElement).value = v;
  el.dispatchEvent(new Event('input'));
  await nextTick();
  await settle(4);
};

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  monacoCaps.length = 0;
  mocks.adhocJobs.mockResolvedValue([]);
  mocks.adhocStatus.mockResolvedValue({});
  mocks.xbJobs.mockResolvedValue([]);
  mocks.sqlLenient.mockResolvedValue({});
});

/* ═══ 结构锁：源码正则（改模板/函数名必须在此同步更新） ═══ */
describe('524 W1 结构锁（源码）', () => {
  const src = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

  it('T1 Adhoc 最近作业：kw 输入+visibleJobs 行集+MarkText 高亮+状态漏斗+TSV/MD 导出（529 同步更新 QRT rows 壳）', () => {
    const v = src('../views/AdhocRebuildView.vue');
    /* 同步更新：kw 过滤改用 SearchFilterBar 统一件（559 TasksView tv-kw 先例）——
       裸 input 的 aria-label 退役，可读性由 SFB 内建 aria-label=placeholder 承担（文案逐字保留）；
       ar-jobs-kw 类锚随 input-class 留在 input 上（下方行为锚 setInput('.ar-jobs-kw') 同路径零迁） */
    expect(v).toMatch(/<SearchFilterBar v-model="jobKw" class="ar-jobs-kw-wrap" input-class="ar-jobs-kw" placeholder="过滤：jobId \/ 逻辑名 \/ 状态" \/>/);
    /*  W-B 同步更新：裸表换 QRT rows 型——v-for 行循环退役，行集收口 jobsMatrix
       （=visibleJobs.map 单一来源）喂 :rows；MarkText 迁 #cell-<col> 槽，jobId/logicalName
       计 2 处。同步更新：status cell 手滚 pill 改用 StatusPill（中文+en 小字组件化），
       其 2 处 MarkText（过滤词命中高亮）随装退役——英文枚举不再吃过滤高亮，524 行为锚见下。 */
    expect(v).toMatch(/:rows="jobsMatrix"/);
    expect(v).toMatch(/const jobsMatrix = computed<any\[\]\[\]>\(\(\) => visibleJobs\.value\.map/);
    expect(v.match(/<MarkText :text="row\[(0|1|3)\]" :kw="jobKw" \/>/g)?.length).toBe(2);
    expect(v).toMatch(/aria-pressed="jobStatusFilter === funnelKey\(row\[3\]\)/);
    expect(v).toMatch(/@click\.stop="toggleJobStatusFilter\(row\[3\]\)"/);
    expect(v).toMatch(/@click="exportJobsMatrix\('md'\)"/);
    expect(v).toMatch(/@click="exportJobsMatrix\('tsv'\)"/);
    expect(v).toMatch(/matrixText\(\{ rows, cols, getVal: \(r: any, c: string\) => r\[c\] \?\? '' \}, fmt\)/);
    expect(v).toContain('清除过滤');
  });

  it('T2 Adhoc 轮次表 tfoot Σ：created/updated/versionConflicts 三聚合', () => {
    const v = src('../views/AdhocRebuildView.vue');
    expect(v).toMatch(/<tfoot class="ar-rounds-agg">/);
    expect(v.match(/roundSum\('(created|updated|versionConflicts)'\)/g)?.length).toBe(3);
    expect(v).toMatch(/function roundSum\(k: string\): string/);
  });

  it('T3 Xmigrate：QRT rows 型换壳（kw 过滤宿主侧+Σ 聚合内核化+z 档位注释）', () => {
    const v = src('../views/XmigrateView.vue');
    /* 同步更新：SFB 改用同 T1——placeholder 逐字保留兼 aria-label；
       cardShellWave547 DOM 锚字面（class="inp xm-jobs-kw"）经 input-class 保真 */
    expect(v).toMatch(/<SearchFilterBar v-model="jobKw" class="xm-jobs-kw-wrap" input-class="inp xm-jobs-kw" placeholder="过滤：状态 \/ 目标索引 \/ 源索引" \/>/);
    expect(v).toMatch(/const jobKw = ref\(''\);/);
    expect(v).toMatch(/\[j\.status, j\.destIndex, j\.sourceIndex\]\.some/);
    /* 导出仍以排序后可见行集为源（所见即所复，xmigrateMdCopy 同源断言）——
        W-C 换壳 QRT 后经 exportRows()→getSortedRows() 取排序后行集 */
    expect(v.match(/const rows = exportRows\(\);/g)?.length).toBeGreaterThanOrEqual(2);
    /* Σ 聚合随壳合并 QRT 内建（列头菜单「聚合行」开关，es_tbl_agg:xm-jobs 记忆；
       进度列矩阵值=migrated 数值——Σ 聚合语义承接原 tfoot Σmigrated，行为锁见下） */
    expect(v).toMatch(/<QueryResultTable v-else-if="jobs\.length" ref="qrtRef" :cols="XM_COLS" :rows="jobRows" sortable/);
    expect(v).toMatch(/storage-key="xm-jobs"/);
    /* 同步更新：tfoot 聚合行合并 TableAggFoot 片段组件（Xmigrate 消费侧接线零触） */
    expect(src('../components/QueryResultTable.vue')).toContain('<TableAggFoot v-if="aggOn" prefix="qrt"');
    /* z 档位说明在位：局部层级说明 + 裸值未动（勿硬归 token 是裁定）。
       855 清洗随迁：原锁「/*  W1 z 档位注释」双空格+轮次标记已清，锁语义不变 */
    expect(v).toMatch(/\.xm-drop \{\s*\n\s*\/\* z 档位说明/);
    expect(v).toContain('z-index: 50;');
  });

  it('T4 SqlBridge：真表格（QRT 内核）+语义档类型推断+三格式复制+预览语义明示（W5 同步更新）', () => {
    /*  W5：预览裸表（br-ptbl）换 QRT rows 型——语义显示层（ISO 日期本地化/
       数值右对齐千分位）由 brColTypes 按值推断喂 QRT fieldTypes 通道（display 归内核
       displayText，数据恒 raw）；三格式全量复制与「仅预览前 20 行」明示保留。
       ：brColTypes 宿主胶水退役——QRT 内建按值采样档口径等价（预览 20 行
       切片与内核采样窗一致），锚同步更新为内建档依赖（不再传 field-types）。 */
    const v = src('../views/SqlBridgeView.vue');
    expect(v).toMatch(/<QueryResultTable :cols="lastCols" :rows="previewRows" sortable/);
    expect(v).not.toMatch(/:field-types="brColTypes"/);
    expect(v).not.toContain('BR_ISO_DT_RE');
    expect(v).toMatch(/QRT 内建按值采样档/);
    expect(v).toMatch(/const previewRows = computed\(\(\) => lastRows\.value\.slice\(0, 20\)\)/);
    expect(v).toMatch(/copyPreviewMatrix\('(tsv|md|json)'\)/);
    /* 旧手写表格皮与语义显示函数不残留（换壳勿留双份） */
    expect(v).not.toContain('br-ptbl');
    expect(v).not.toMatch(/function brCellText\(/);
    expect(v).not.toMatch(/function copyPreview\(/);
    expect(v).toContain('仅预览前');
  });
});

/* ═══ T1/T2 行为锁：AdhocRebuild 最近作业表 ═══ */
describe('524 W1 Adhoc 最近作业表（挂载行为）', () => {
  const JOBS = [
    { jobId: 'j-bond-1', logicalName: 'bond_index', strategy: 'INCREMENTAL', status: 'RUNNING', stage: 'REINDEX', startedAt: 1700000000000 },
    { jobId: 'j-other-2', logicalName: 'other_idx', strategy: 'WRITE_BLOCK', status: 'DONE', stage: 'DONE', startedAt: 1700000001000 },
    { jobId: 'j-bond-3', logicalName: 'bond_pledge', strategy: 'MANUAL', status: 'RUNNING', stage: 'SWITCH', startedAt: 1700000002000 },
  ];
  const ROUNDS_JOB = {
    jobId: 'j-bond-1', status: 'SUCCEEDED', stage: 'DONE',
    rounds: [
      { round: 1, phase: 'FULL', total: 100, created: 90, updated: 5, versionConflicts: 2 },
      { round: 2, phase: 'INCR', total: 20, created: 7, updated: 3, versionConflicts: 1 },
    ],
  };
  const jobsCard = (host: HTMLElement) =>
    /* 554 同步更新：.card 壳退役改 .ar-sec border-top 分节（定位语义=含作业表工具行的分节，不变） */
    [...host.querySelectorAll('.ar-sec')].find(c => c.querySelector('.ar-jobs-tools'))!;

  /* 1319d：本用例 = 动态 import 整个 AdhocRebuildView（含 Monaco 链）+ 挂载。
     单文件冷跑实测 4.1s，并发门禁的机器负载下会贴穿 5s 默认帽被记成失败
     （两条断言本身与时间无关）。提额 30s，留足 2× 以上余量，
     避免把机器冷变换抖动记成产品红灯。 */
  it('kw 过滤收窄行集 + MarkText 命中高亮 + 清除过滤恢复', { timeout: 30000 }, async () => {
    mocks.adhocJobs.mockResolvedValue(JOBS);
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { app, host } = await mountView(View);
    const card = jobsCard(host);
    expect(card.querySelectorAll('tbody tr').length).toBe(3);
    await setInput(card.querySelector('.ar-jobs-kw')!, 'bond');
    expect(card.querySelectorAll('tbody tr').length).toBe(2);
    expect(card.querySelectorAll('mark').length).toBeGreaterThanOrEqual(2);
    expect(card.textContent).toContain('2/3 条命中');
    (card.querySelector<HTMLButtonElement>('.ar-jobs-tools button')!).click();
    await settle(4);
    expect(card.querySelectorAll('tbody tr').length).toBe(3);
    app.unmount();
  });

  it('状态 pill 漏斗：点状态只看该状态（aria-pressed），再点取消', async () => {
    mocks.adhocJobs.mockResolvedValue(JOBS);
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { app, host } = await mountView(View);
    const card = jobsCard(host);
    const pill = card.querySelector('.ar-st-funnel') as HTMLElement;
    pill.click();
    await settle(4);
    const rows = card.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect((pill as HTMLElement).getAttribute('aria-pressed')).toBe('true');
    pill.click();
    await settle(4);
    expect(card.querySelectorAll('tbody tr').length).toBe(3);
    expect(pill.getAttribute('aria-pressed')).toBe('false');
    app.unmount();
  });

  it('T2 轮次表 tfoot Σ：Σcreated=97 / Σupdated=8 / ΣversionConflicts=3', async () => {
    mocks.adhocJobs.mockResolvedValue(JOBS);
    mocks.adhocStatus.mockResolvedValue(ROUNDS_JOB);
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { app, host } = await mountView(View);
    const card = jobsCard(host);
    (card.querySelector<HTMLButtonElement>('button[aria-label="查看任务详情"]')!).click();
    await settle();
    const tfoot = host.querySelector('.ar-rounds-agg');
    expect(tfoot, '轮次表 Σ 聚合行在位').toBeTruthy();
    expect(tfoot!.textContent).toContain('Σ 97');
    expect(tfoot!.textContent).toContain('Σ 8');
    expect(tfoot!.textContent).toContain('Σ 3');
    app.unmount();
  });
});

/* ═══ T3 行为锁：Xmigrate 作业表过滤 + Σ 聚合作用于过滤后集合 ═══
    W-C：换壳 QRT rows 型——Σ 聚合为内核 useAggRow（预写 es_tbl_agg:xm-jobs=1
   预开，即列头菜单开关的落盘形态）；进度列矩阵值=migrated（Σ 13 承接原 Σmigrated）、
   冲突/错误列各自 Σ（'Σ 2 ·'/'Σ 1 ·' 精确匹配避免数字前后缀误撞）。 */
describe('524 W1 Xmigrate 作业表（挂载行为）', () => {
  const JOBS = [
    { jobId: 'a-1', status: 'DONE', destIndex: 'dest-1', sourceIndex: 'src-a', remoteEndpoint: '', migrated: 10, total: 10, conflicts: 0, errors: 1, createTime: 1700000000000, sliceStatus: {} },
    { jobId: 'b-2', status: 'RUNNING', destIndex: 'dest-2', sourceIndex: 'src-b', remoteEndpoint: '', migrated: 3, total: 0, conflicts: 2, errors: 0, createTime: 1700000001000, sliceStatus: {} },
  ];

  it('kw 过滤（状态/目标/源）收窄行集，QRT Σ 聚合随过滤后集合重算', async () => {
    localStorage.setItem('es_tbl_agg:xm-jobs', '1');
    mocks.xbJobs.mockResolvedValue(JOBS);
    const View = (await import('../views/XmigrateView.vue')).default;
    const { app, host } = await mountView(View);
    await settle();
    const tbl = host.querySelector('.qrt-tbl')!;
    expect(tbl.querySelectorAll('tbody tr').length).toBe(2);
    expect(tbl.querySelector('tfoot')!.textContent).toContain('Σ 13 ·');
    expect(tbl.querySelector('tfoot')!.textContent).toContain('Σ 2 ·');
    expect(tbl.querySelector('tfoot')!.textContent).toContain('Σ 1 ·');
    await setInput(host.querySelector('.xm-jobs-kw')!, 'dest-1');
    expect(tbl.querySelectorAll('tbody tr').length).toBe(1);
    expect(tbl.querySelector('tfoot')!.textContent).toContain('Σ 10 ·');
    expect(tbl.querySelector('tfoot')!.textContent).not.toContain('Σ 2 ·');
    /* 按状态字段过滤（kw 匹配 status） */
    await setInput(host.querySelector('.xm-jobs-kw')!, 'running');
    expect(tbl.querySelectorAll('tbody tr').length).toBe(1);
    expect(tbl.querySelector('tfoot')!.textContent).toContain('Σ 3 ·');
    app.unmount();
  });
});

/* ═══ T4 行为锁：SqlBridge 试跑结果真表格 ═══ */
describe('524 W1 SqlBridge 试跑结果表格（挂载行为）', () => {
  it('表头=cols/行=前 20 行明示/数值右对齐/日期本地化/null→∅/TSV 复制取全量', async () => {
    const rows: any[][] = [];
    for (let i = 0; i < 25; i++) rows.push([i * 1000, '2024-01-01T00:00:00.000Z', null]);
    mocks.sqlLenient.mockResolvedValue({ rows, columns: ['cnt', 'dt', 'nul'] });
    const View = (await import('../views/SqlBridgeView.vue')).default;
    const { app, host } = await mountView(View);
    monacoCaps[0].emit('update:modelValue', 'SELECT cnt, dt, nul FROM "i"');
    await settle(4);
    const runBtn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('试跑'))!;
    runBtn.click();
    await settle();
    const tbl = host.querySelector('.br-preview table.qrt-tbl')!;
    expect(tbl.querySelectorAll('thead th[data-col]').length).toBe(3);
    expect(tbl.querySelectorAll('tbody tr').length, '仅预览前 20 行').toBe(20);
    expect(host.querySelector('.br-preview-note')!.textContent).toContain('仅预览前 20 行（共 25 行）');
    /* QRT 序号列之后首个业务格起断言（td[0]=#） */
    const tr0 = tbl.querySelector('tbody tr')!;
    const tds = tr0.querySelectorAll('td');
    expect(tds[1].className).toContain('num-col');
    expect(tds[1].textContent).toBe('0');
    expect(tds[2].textContent).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(tds[3].textContent).toBe('∅');
    /* TSV 复制取 lastRows 全量（25 行，非预览 20 行）；happy-dom navigator.clipboard 仅 getter，defineProperty 注入 */
    const writeText = vi.fn(async (_t: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    [...host.querySelectorAll('button')].find(b => b.textContent?.includes('复制全部（TSV）'))!.click();
    await settle(4);
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied.split('\n').length).toBe(26);
    expect(copied.split('\n')[0]).toBe('cnt\tdt\tnul');
    app.unmount();
    /* 全量分片并行时该挂载用例实测 4~20s（QRT 25 行 + 复制 + 开发服务并发），
       5s 默认值会随机超时；本用例本身含 settle 等待，放行到 60s 以覆盖高负载工作站。 */
  }, 60000);
});
