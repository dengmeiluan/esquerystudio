/**
 * 五百三十二批 W3：表格内核第三波（消费侧接线波浪）。
 * 锁定：
 * 1) 两换壳——ReconcileReportDrawer（rr-tbl→QRT rows 型，漏斗/kw/copyMatrix 退役归内核
 *    quickFilter，索引列补 goHub 芯片）+ MatchMatrixView（mm-tbl→QRT rows 型，useTableSort/
 *    sticky/手写 CSV 退役，_id 列补查询 X 光下钻 carry，冻结左两列播种内核记忆）；
 * 2) loading 接线渗透——DslQueryView(RT)/DiagView/SecurityView(audit)/IndexHubView(qryTbl)/
 *    ProfileFlameView 五表补 :loading（在途骨架态，空时段落蒸发/首查白板根治）；
 * 3) export-name 全批统一——reconcile-report/match-matrix/diag-ops/sec-audit/profile-flame/xm-jobs；
 * 4) 杂项——IndexHub store.size 走 semBytes 同页口径 + 查询 tab JsonArea lintDsl 划线、
 *    DslQueryView 文档弹窗编辑器高度 usePref('dq.popH') 记忆 + dq-card 描边降层、
 *    Xmigrate hitTimer 卸载清理。
 * 挂载样板照抄 tableKernelWave531（裸 createApp + pinia；ReconcileReportDrawer 真挂验证
 * quickFilter 过滤/goHub 跳转/StatusPill 语义）。
 *
 * 六百七十五批同步更新（674-C1 复诊收口，基线红清零收官；纯 spec 同步更新零产品码）：
 * ①IH qryTbl 锚随 667~669 IH 演进形态改写（ref 与 v-else-if 间入列 export-name="ih-qry" 行）；
 * ②DQ 文档弹窗高度锁随 561 usePref('dq.popH')→useTierCycle('dq.docH') 机制升级改写
 *   （取值锁承接 674 件B 同源形态，629-C2 同步更新补取值锁）+669 :font-size 同页同键契约入锁；
 * ③.dq-card 描边降层锁随 667 改用迁 AltHitsViews 共享件（卡片内脏五件样式逐值同源）。
 * 同步更新后本件显式入库（667 ihUnify554 显式入库先例形态），⑤ 基线新 clone 可复现。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPORTS = [
  { indexKey: 'k1', index: 'idx-alpha', status: 'UPDATED', reason: 'PUT ok' },
  { indexKey: 'k2', index: 'idx-beta', status: 'CONFLICT', reason: 'PUT_FAILED: mapper parse' },
  { indexKey: 'k3', index: 'idx-gamma', status: 'NO_CHANGE', reason: '' },
];

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingReconcileReport: vi.fn(async () => ({ reports: REPORTS })),
    },
  };
});

import ReconcileReportDrawer from '../components/ReconcileReportDrawer.vue';

const readView = (name: string) => readFileSync(join(__dirname, '../views', name), 'utf-8');
const rrd = readFileSync(join(__dirname, '../components/ReconcileReportDrawer.vue'), 'utf-8');
const ahv = readFileSync(join(__dirname, '../components/AltHitsViews.vue'), 'utf-8'); /* 675 同步更新：.dq-card 系 667 改用迁 AltHitsViews */
const mmv = readView('MatchMatrixView.vue');
const dq = readView('DslQueryView.vue');
const diag = readView('DiagView.vue');
const sec = readView('SecurityView.vue');
const ih = readView('IndexHubView.vue');
const pf = readView('ProfileFlameView.vue');
const xm = readView('XmigrateView.vue');

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  /* n-drawer teleport 到 body 的残留容器（tableKernelWave531 同款清理） */
  document.querySelectorAll('.n-drawer, .n-drawer-container, .n-drawer-body-content-wrapper').forEach(e => e.remove());
});

async function mountDrawer() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }, { path: '/indices', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const show = ref(false);
  const app = createApp({
    setup: () => () => h(ReconcileReportDrawer, { show: show.value, 'onUpdate:show': (v: boolean) => { show.value = v; } }),
  });
  app.use(createPinia());
  app.use(router);
  app.mount(host);
  apps.push(app);
  await tick();
  show.value = true; /* 打开抽屉触发 watch 重拉（与真实开启路径一致） */
  await tick(10);
  return { app, router };
}

/* n-drawer 内容 teleport 到 body——查 document 而非 host（531 前例同款处理） */
const rrDataRows = () =>
  [...document.querySelectorAll('table.qrt-tbl tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'));

/* ═══════════ 一、两换壳（源码锁） ═══════════ */
describe('五百三十二批两换壳：ReconcileReportDrawer + MatchMatrixView → QRT rows 型', () => {
  it('rrd：QRT 在场（中文列键同源旧表头）+ storage-key=rr + quick-filter 接线 + 旧类名/机制退役', () => {
    expect(rrd).toMatch(/<QueryResultTable\s*\n\s*:cols="RR_COLS" :rows="rrMatrix" sortable\s*\n\s*storage-key="rr"\s*\n\s*:quick-filter="kw"/);
    expect(rrd).toMatch(/const RR_COLS = \['状态', '索引', '说明'\];/);
    /* 旧形态退役不回潮：rr-tbl 裸表/漏斗 chips/statusFilter/copyMatrix/MarkText/kw>20 门控 */
    expect(rrd).not.toMatch(/class="tbl rr-tbl"|class="rr-tbl"/);
    expect(rrd).not.toMatch(/const FUNNEL = \[/);
    expect(rrd).not.toMatch(/const statusFilter = ref\(''\);/);
    expect(rrd).not.toContain("from '../utils/copyMatrix'");
    expect(rrd).not.toContain('<MarkText');
    expect(rrd).not.toMatch(/rows\.length > 20/);
  });

  it('rrd：状态列 StatusPill 语义 + 索引列 goHub 芯片 + 内核 export/空态/骨架接线', () => {
    expect(rrd).toMatch(/<StatusPill :tone="STATUS_TONE\[value\] \?\? 'n'" :label="value" \/>/);
    expect(rrd).toMatch(/<button class="rr-go" :aria-label="'打开索引工作区：' \+ value" title="打开索引工作区" @click\.stop="gotoHub\(value\)">/);
    expect(rrd).toContain("router.push({ path: '/indices', query: { idx } })");
    expect(rrd).toContain('export-name="reconcile-report"');
    expect(rrd).toContain(':loading="loading"');
    expect(rrd).toContain('empty-text="暂无对账记录"');
    expect(rrd).toContain(':empty-hint="RR_EMPTY_HINT"');
  });

  it('mm：QRT 在场 + storage-key=mm + 冻结播种 + mm-tbl/useTableSort/手写 CSV 退役', () => {
    expect(mmv).toMatch(/<QueryResultTable v-if="hits\.length" :cols="mmCols" :rows="mmRows" sortable[^>]*storage-key="mm" :field-types="\{ 得分: 'double' \}"/);
    expect(mmv).toContain("if (localStorage.getItem('es_tbl_freeze_n:mm') == null) {");
    expect(mmv).toContain("writeStoredRaw(localStorage, 'es_tbl_freeze_n:mm', '2')");
    expect(mmv).not.toMatch(/<table class="mm-tbl"/);
    expect(mmv).not.toMatch(/\.mm-tbl-wrap/);
    expect(mmv).not.toContain("from '../composables/tableSort'");
    expect(mmv).not.toMatch(/function exportCsv\(\)/);
    expect(mmv).toContain('export-name="match-matrix"');
  });

  it('mm：子句 ✔/· 走 #cell- 动态槽 + _id 下钻 xray carry（现成键不造新页）', () => {
    expect(mmv).toMatch(/<template v-for="c in clauseNames" :key="c" #\[`cell-`\+c\]="\{ value \}">/);
    expect(mmv).toMatch(/value === '✔' \? 'hit' : 'miss'/);
    expect(mmv).toContain("<template #cell-_id=\"{ value }\">");
    expect(mmv).toContain("useLinkCarry<{ index: string; id: string }>('xray')");
    expect(mmv).toMatch(/xrayCarry\.send\(\{ index: index\.value, id \}\)/);
    expect(mmv).toContain("router.push('/query-xray')");
  });
});

/* ═══════════ 二、换壳运行时：drawer quickFilter 过滤 / goHub 跳转 / StatusPill ═══════════ */
describe('五百三十二批 rrd 运行时：内核 quickFilter + goHub 芯片（挂载）', () => {
  it('打开抽屉拉报告 → QRT rows 渲染 3 行；状态列 StatusPill 色档；索引列芯片点击 push /indices?idx=', async () => {
    const { app, router } = await mountDrawer();
    expect(rrDataRows().length, '三条对账记录渲染').toBe(3);
    expect(rrDataRows()[0].textContent).toContain('已补全');
    /* StatusPill 语义：g（已补全）/r（类型冲突）档随行在 */
    expect(rrDataRows()[0].querySelector('.pill.g')).toBeTruthy();
    expect(rrDataRows()[1].querySelector('.pill.r')).toBeTruthy();
    /* goHub 芯片：/indices?idx= 直达索引工作区（pushSpy 口径同 indexChipNav247） */
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as any);
    const chip = rrDataRows()[0].querySelector<HTMLButtonElement>('button.rr-go');
    expect(chip, 'goHub 芯片渲染').toBeTruthy();
    chip!.click();
    await tick(6);
    expect(pushSpy).toHaveBeenCalledWith({ path: '/indices', query: { idx: 'idx-alpha' } });
    app.unmount();
  });

  it('quick-filter 输入过滤行集（内核 contains 跨列）+ 清除恢复', async () => {
    const { app } = await mountDrawer();
    const inp = document.querySelector<HTMLInputElement>('input.rr-kw');
    expect(inp, 'quick-filter 输入在场（漏斗/kw 合一退役形态）').toBeTruthy();
    inp!.value = 'idx-beta';
    inp!.dispatchEvent(new Event('input', { bubbles: true }));
    await tick(6);
    expect(rrDataRows().length, 'quickFilter 命中 1 行').toBe(1);
    expect(rrDataRows()[0].textContent).toContain('idx-beta');
    inp!.value = 'zzz-none';
    inp!.dispatchEvent(new Event('input', { bubbles: true }));
    await tick(6);
    expect(rrDataRows().length, '0 命中归零').toBe(0);
    /* quickFilter 0 行并入内核空态链（530 批 W-B：EmptyState 文案走既有 emptyText） */
    expect(document.body.textContent).toContain('暂无对账记录');
    app.unmount();
  });
});

/* ═══════════ 三、loading 接线渗透（五表源码锁） ═══════════ */
describe('五百三十二批 loading 接线渗透', () => {
  it('DslQueryView RT：:loading="running"（268 批内建骨架启用，首查白板根治）', () => {
    /* 541 批同步更新：v-show 切视图语义演进为 hide-body（工具行常驻），:loading 保留 */
    expect(dq).toMatch(/<ResultTable ref="resultTbl"\s*\n\s+:hide-body="view !== 'table'"\s*\n\s+:loading="running"/);
  });
  it('DiagView：QRT loading 期间常挂（空时段落蒸发根治）+ v-else EmptyState + export-name', () => {
    expect(diag).toMatch(/<QueryResultTable v-if="nodes\.length \|\| loadingOps"/);
    expect(diag).toMatch(/:loading="loadingOps" export-name="diag-ops"/);
    expect(diag).toMatch(/<EmptyState v-else :icon="Activity" text="点击刷新加载节点资源快照" \/>/);
  });
  it('SecurityView audit：:loading + selectable（users 表同款）+ export-name=sec-audit', () => {
    expect(sec).toMatch(/:loading="auditLoading"\s*\n\s+selectable\s*\n\s+@selection-change="auditSel = \$event"/);
    expect(sec).toContain('export-name="sec-audit"');
    expect(sec).toContain('const auditSel = ref<unknown[]>([]);');
  });
  it('IndexHubView qryTbl：:loading（docsTbl 对称）', () => {
    /* 675 同步更新（674-C1 复诊）：667~669 IH 演进在 ref 与 v-else-if 间入列 export-name="ih-qry" 行。
       1330：该标签后续又追加了 :bar-menu-extra——属性间不再紧邻，断言改为
       「同一个 <ResultTable ref="qryTbl"> 标签内同时具备这三项」，不再锁属性顺序。 */
    const m = ih.match(/<ResultTable ref="qryTbl"[\s\S]*?>/);
    expect(m, 'IndexHubView 必须有 qryTbl 表').toBeTruthy();
    const tag = m![0];
    expect(tag, '导出名').toContain('export-name="ih-qry"');
    expect(tag, 'v-else-if 门控').toContain('v-else-if="qryResp"');
    expect(tag, ':loading 接线').toContain(':loading="qryLoading"');
  });
  it('ProfileFlameView：:loading="busy"（semOn 形态核对后不接，见源内注）', () => {
    expect(pf).toMatch(/max-height="420px" :loading="busy"/);
    expect(pf).toContain('semOn 经形态核对不接');
  });
});

/* ═══════════ 四、export-name 全批断言 ═══════════ */
describe('五百三十二批 export-name 全批', () => {
  it('六表导出文件名统一语义前缀（时间戳由内核统一拼 exportStamp）', () => {
    expect(rrd).toContain('export-name="reconcile-report"');
    expect(mmv).toContain('export-name="match-matrix"');
    expect(diag).toContain('export-name="diag-ops"');
    expect(sec).toContain('export-name="sec-audit"');
    expect(pf).toContain('export-name="profile-flame"');
    expect(xm).toContain('export-name="xm-jobs"');
  });
});

/* ═══════════ 五、杂项锚（IndexHub / DslQueryView / Xmigrate） ═══════════ */
describe('五百三十二批杂项锚', () => {
  it('IndexHub：索引列表 store.size 裸串 → semBytes 同页口径（title 恒 raw）', () => {
    expect(ih).toContain('{{ semBytes(idx[\'store.size\']) }}');
    expect(ih).toMatch(/:title="`存储 \$\{idx\['store\.size'\] \|\| '-'\} · \$\{idx\.pri\}\/\$\{idx\.rep\} 分片 · 创建 \$\{fmtDate\(idx\['creation\.date\.string'\]\)\}`"/);
  });
  it('IndexHub：查询 tab JsonArea 接 lintDsl 划线（PitScrollView 同款挂法，只消费既有出口）', () => {
    expect(ih).toContain("import { lintDsl } from '../utils/dslLint';");
    expect(ih).toContain('<JsonArea ref="dslJaRef" v-model="dsl" fill :dsl-assist="ihDslAssist"');
    expect(ih).toContain('const queueDslLint = useDebounceFn(');
    expect(ih).toMatch(/watch\(dsl, \(\) => queueDslLint\(\), \{ immediate: true \}\);/);
    expect(ih).toMatch(/severity: f\.severity === 'info' \? 'hint' as const/); /* info→hint 降级口（PitScrollView 同款） */
  });
  it('DslQueryView：文档弹窗编辑器高度 useTierCycle(dq.docH) 三档循环（561 机制升级同步更新）+ 弹窗字号同页同键（669）+ dq-card 描边降层（667 改用 AltHitsViews）', () => {
    /* 675 同步更新（674-C1 复诊）：usePref('dq.popH') 单值 → useTierCycle('dq.docH') 三档循环，取值锁承接 674 件B 同源字面形态 */
    expect(dq).toContain("const DOC_H_TIERS: string[] = ['min(60vh,420px)', 'min(70vh,560px)', 'min(80vh,700px)'];");
    expect(dq).toContain("useTierCycle('dq.docH', DOC_H_TIERS)");
    /* 669 批件B：文档弹窗 Monaco :font-size 复用 dq.font（同页同键约定先例） */
    expect(dq).toMatch(/<MonacoEditor v-if="docEditMode" v-model="docEditText" :height="docH" :font-size="dqFont" \/>/);
    /* 667 批改用：卡片内脏五件样式 .dq-card 系逐值同源迁 AltHitsViews 共享件，描边降层语义锁同步更新 */
    expect(ahv).toMatch(/\.dq-card \{ background: var\(--bg2\); border: 1px solid var\(--line\); border-radius: var\(--r-m\);/);
    expect(ahv).toMatch(/\.dq-card:hover \{ border-color: var\(--ac-line\);/);
  });
  it('Xmigrate：hitTimer 卸载清理 + QRT 首行标签不动（524/370 锚零改）', () => {
    expect(xm).toMatch(/onBeforeUnmount\(\(\) => \{ if \(hitTimer\) clearTimeout\(hitTimer\); \}\);/);
    expect(xm).toMatch(/<QueryResultTable v-else-if="jobs\.length" ref="qrtRef" :cols="XM_COLS" :rows="jobRows" sortable/);
  });
});
