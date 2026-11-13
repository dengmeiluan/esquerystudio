/**
 * 五百二十四批 W5 合并扫尾（S 级）——8 处落点防回退锁：
 *   T1 AnalyzeView：补 PageHeader 统一件 + Token 详情表 kw 过滤/MarkText
 *                  （525 批反转：页内 IndexPicker 退役换只读 CurrentIdxChip）；
 *   T2 IlmView：explain 索引裸 n-select 换统一选择器（525 批反转：页内选择器退役换只读 CurrentIdxChip）
 *              + 手写 meta-strip 裸 div 换 MetaStrip :items（525 批去全局 .meta-strip 只留 .mono）；
 *   T3 TasksView：kw 过滤（taskId/action/描述 + MarkText）+ ?taskId= 深链读侧（高亮+定位）；
 *   T4 ClusterSettingsView：matrixText TSV/MD 整表复制 + .cs-grp 字重 700→650；
 *   T5 ReconcileReportDrawer：状态 pill 漏斗 + matrixText 复制 + 条目>20 kw 过滤门控
 *                  （532 批反转：rr-tbl 换壳 QRT，漏斗/kw/copyMatrix 退役归内核 quickFilter）；
 *   T7 TopologyView：固定 10s checkbox 换 AutoRefreshSelect（10s 保留为默认档）；
 *   T8 AnalysisSettingsView(.as-empty×3)/MappingDesignerView(.md-empty×4) 换 EmptyState compact。
 * （T6 ColDetailModal 值行>20 门控跳过：useColStats top 恒 slice(0,5)，>20 不可达——前提不成立。）
 *
 * 形态说明：视图面全部源码锁（本仓 layoutOcclusion501/emptyStateSweep 同手法；Monaco/
 * n-drawer 在 happy-dom 挂载成本高）；TasksView 深链+kw 过滤带真实挂载（route.query 消费
 * 是运行时行为，静态锁照不住）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const rd = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const analyze = rd('../views/AnalyzeView.vue');
const ilm = rd('../views/IlmView.vue');
const tasks = rd('../views/TasksView.vue');
const cs = rd('../views/ClusterSettingsView.vue');
const rr = rd('../components/ReconcileReportDrawer.vue');
const topo = rd('../views/TopologyView.vue');
const asv = rd('../views/AnalysisSettingsView.vue');
const mdv = rd('../views/MappingDesignerView.vue');

/* ═══════════ T1 AnalyzeView ═══════════ */
describe('T1 AnalyzeView：PageHeader + token 表 kw 过滤（524；525 批反转同步更新）', () => {
  it('补页头统一件（邻页范式，标题贴分词验证语义）', () => {
    expect(analyze).toMatch(/<PageHeader :icon="FlaskConical" title="分词验证（Analyze）"/);
    expect(analyze).toContain("import PageHeader from '../components/PageHeader.vue';");
  });
  it('页内 IndexPicker 退役换只读 CurrentIdxChip（525 反转：选索引入口收敛顶栏；IndexPicker 不回潮）', () => {
    expect(analyze).toContain('<CurrentIdxChip />');
    expect(analyze).toContain("import CurrentIdxChip from '../components/CurrentIdxChip.vue';");
    /* IndexPicker/pickerIdx 不回潮（代码级字面清零，注释里的承接说明不算回潮） */
    expect(analyze).not.toMatch(/<IndexPicker/);
    expect(analyze).not.toMatch(/pickerIdx/);
    expect(analyze).not.toMatch(/from '\.\.\/utils\/indexOptions'/);
    expect(analyze).not.toMatch(/:render-label|:options="indexOpts"|<n-select/);
    /* 「不限定索引」显式开关保留（本次请求是否带 index 的语义，与 chip 展示解耦） */
    expect(analyze).toMatch(/v-model:checked="globalAnalyze"/);
    /* useIdxState follow 绑定零改 */
    expect(analyze).toMatch(/const followed = useIdxState\(\{ follow: true \}\);/);
  });
  it('Token 详情表 kw 过滤：输入/命中计数/MarkText/序号保原位（529 反转同步更新：MarkText 走 #cell- 槽）', () => {
    /* 六百五十批同步更新：kw 过滤胞改用 SearchFilterBar 统一件（sfbUnify650 锁；av-tk-kw 运行时锚保留） */
    expect(analyze).toMatch(/<SearchFilterBar v-model="tkKw" class="av-tk-kw-wrap" input-class="av-tk-kw"/);
    expect(analyze).toMatch(/命中 \{\{ shownTokens\.length \}\} \/ \{\{ tokens\.length \}\}/);
    /* 五百二十九批锚同步更新：裸表行内 <MarkText :text="r.t.token"…> → #cell-词元/#cell-词性
       作用域槽（QRT 换壳后命中高亮经槽保真，r.t.* → 槽 value） */
    expect(analyze).toMatch(/<MarkText :text="value" :kw="tkKw" \/>/);
    expect(analyze).toMatch(/<MarkText :text="posZh\(value\)" :kw="tkKw" \/>/);
    expect(analyze).toMatch(/const shownTokens = computed\(/);
    expect(analyze).toMatch(/tokens\.value\.map\(\(t, i\) => \(\{ t, i \}\)\)/);
    expect(analyze).toContain("import MarkText from '../components/MarkText.vue';");
  });
});

/* ═══════════ T2 IlmView ═══════════ */
describe('T2 IlmView：explain 选择器 + MetaStrip 统一件（524；525 批反转同步更新）', () => {
  it('页内可写选择器退役换只读 CurrentIdxChip（选索引唯一入口=顶栏；follow 语义不变）', () => {
    expect(ilm).toContain('<CurrentIdxChip />');
    expect(ilm).not.toMatch(/<IndexPicker/);
    expect(ilm).not.toMatch(/<n-select/);
    expect(ilm).not.toMatch(/NSelect/);
  });
  it('手写 meta-strip 裸 div 换 MetaStrip :items（DiagView 正解形态，err 档走 tone）；525 批去全局 .meta-strip 双轨，535 批补 .mono 摘除', () => {
    expect(ilm).toMatch(/<MetaStrip class="ilm-meta" :items="ilmMeta"/); /* 五百三十五批锚同步更新：.mono 摘除（组件 .ms 自带 mono 字族，W8 meta-strip 全局块退役同判据） */
    expect(ilm, '全局 .meta-strip 类退役（theme.css 归一由并行批处理承担）').not.toMatch(/class="[^"]*meta-strip/);
    expect(ilm).toMatch(/tone: hasErr\.value \? 'err' : undefined/);
    /* 三元色档退役：值不再挂 meta-err class（:class 三元与 scoped 提级规则均清） */
    expect(ilm).not.toMatch(/:class="hasErr \? 'meta-err'|b\.meta-err/);
    /* 原 :title 全量兜底语义保留 */
    expect(ilm).toMatch(/策略 ' \+ policies\.length \+ '（已注册） · 当前视图 ' \+ filtered\.length/);
  });
});

/* ═══════════ T3 TasksView ═══════════ */
describe('T3 TasksView：kw 过滤 + ?taskId= 深链读侧（524）', () => {
  it('kw 输入/shownList 过滤（taskId/action/描述）/MarkText 高亮', () => {
    /* 五百五十八批同步更新：kw 过滤框改用 SearchFilterBar 统一件（tv-kw 类锚随 input-class 保留，
       本文件挂载锁 querySelector('.tv-kw') 同路径零迁；Esc 清空由组件内建承接） */
    expect(tasks).toContain('<SearchFilterBar v-model="kw" class="tv-kw-wrap" input-class="tv-kw"');
    expect(tasks).toMatch(/const shownList = computed\(/);
    expect(tasks).toMatch(/t\.taskId\?\.toLowerCase\(\)\.includes\(k\)/);
    expect(tasks).toMatch(/<MarkText :text="t\.taskId" :kw="kw" \/>/);
    expect(tasks).toMatch(/<MarkText :text="trunc\(t\.description, 80\)" :kw="kw" \/>/);
    expect(tasks).toMatch(/v-for="t in shownList"/);
  });
  it('深链消费：query.taskId → .tv-hit 高亮 + load 后定位（TaskTreeView 同构）', () => {
    expect(tasks).toMatch(/const route = useRoute\(\);/);
    expect(tasks).toMatch(/const deepTaskId = ref\(''\);/);
    expect(tasks).toMatch(/route\.query\.taskId/);
    expect(tasks).toMatch(/class="\{ 'tv-hit': t\.taskId === deepTaskId \}"/);
    expect(tasks).toMatch(/document\.querySelector\('\.tv-node\.tv-hit'\)\?\.scrollIntoView\?/);
  });
});

/* ═══════════ T4 ClusterSettingsView ═══════════ */
describe('T4 ClusterSettingsView：matrixText 整表复制 + 分组行字重（524）', () => {
  it('TSV/MD 两出口接 matrixText 内核（Key/Persistent/Transient/Dirty 四列）', () => {
    expect(cs).toContain("import { matrixText } from '../utils/copyMatrix';");
    expect(cs).toMatch(/async function copyTable\(fmt: 'tsv' \| 'md'\)/);
    expect(cs).toMatch(/cols: \['Key', 'Persistent', 'Transient', 'Dirty'\]/);
    expect(cs).toMatch(/@click="copyTable\('tsv'\)"/);
    expect(cs).toMatch(/@click="copyTable\('md'\)"/);
    expect(cs).toMatch(/isDirty\(k\) \? 'Y' : ''/);
  });
  it('.cs-grp-chip 分组列改用 StatusPill b 统一件（551 批：650/ac-soft 私造规则退役色档归 .pill 单源；531 批换 QRT 壳：分组行改「分组」列 chip，锚类保留）', () => {
    /* 五百五十一批同步更新：原 650 字面锁随私造规则退役失效，改锚改用形态正锁（防回流） */
    expect(cs).toContain('<StatusPill class="cs-grp-chip" tone="b" :label="String(value)" />');
    expect(cs).not.toMatch(/\.cs-grp-chip \{/);
  });
});

/* ═══════════ T5 ReconcileReportDrawer ═══════════ */
/* 五百三十二批：rr-tbl 换壳 QRT rows 型——漏斗/kw/copyMatrix 全退役归内核（quickFilter
   显示+导出同源），T5 三锁同步迁新形态（旧自造过滤机制不回潮） */
describe('T5 ReconcileReportDrawer：QRT 换壳 + quickFilter 收口（524 立；532 换壳同步更新）', () => {
  it('QRT rows 型在场：中文列键与旧表头同源 + storage-key + quick-filter 接线', () => {
    expect(rr).toMatch(/<QueryResultTable\s*\n\s*:cols="RR_COLS" :rows="rrMatrix" sortable\s*\n\s*storage-key="rr"\s*\n\s*:quick-filter="kw"/);
    expect(rr).toMatch(/const RR_COLS = \['状态', '索引', '说明'\];/);
  });
  it('旧自造过滤/复制机制退役不回潮（漏斗 chips/状态筛选/matrixText 手写复制）', () => {
    expect(rr).not.toMatch(/const FUNNEL = \[/);
    expect(rr).not.toMatch(/const statusFilter = ref\(''\);/);
    expect(rr).not.toMatch(/async function copyMatrix\(fmt: 'tsv' \| 'md'\)/);
    expect(rr).not.toContain("from '../utils/copyMatrix'");
    expect(rr).not.toMatch(/class="rr-tbl"/);
  });
  it('状态列 StatusPill 语义 + 索引列 goHub 芯片 + quick-filter 输入在_drawer 内', () => {
    expect(rr).toMatch(/<StatusPill :tone="STATUS_TONE\[value\] \?\? 'n'" :label="value" \/>/);
    expect(rr).toMatch(/@click\.stop="gotoHub\(value\)"/);
    expect(rr).toMatch(/<input v-model="kw" class="ipt rr-kw"/);
    expect(rr).toContain("router.push({ path: '/indices', query: { idx } })");
  });
});

/* ═══════════ T7 TopologyView ═══════════ */
describe('T7 TopologyView：固定 10s checkbox 换 AutoRefreshSelect（524）', () => {
  it('AutoRefreshSelect v-model:ms 接线，10s 保留为默认档（sizes 首档）', () => {
    expect(topo).toContain("import AutoRefreshSelect from '../components/AutoRefreshSelect.vue';");
    expect(topo).toMatch(/<AutoRefreshSelect v-if="autoRefresh" v-model:ms="tpIntervalMs" :sizes="\[10000, 30000, 60000\]"/);
    expect(topo).toMatch(/usePref\('shards\.intervalMs', 10000\)/);
    expect(topo).not.toMatch(/自动 10s/);
    expect(topo).toMatch(/watch\(\[autoRefresh, tpIntervalMs\], \(\) => refresher\.restart\(\)\);/);
  });
});

/* ═══════════ T8 AnalysisSettingsView / MappingDesignerView ═══════════ */
describe('T8 裸空态换 EmptyState compact（524）', () => {
  it('AnalysisSettingsView：三处 as-empty 全量合并，裸类名与规则清零', () => {
    /* 557 批锁同步更新：as-empty-sub「-」占位亦合并 EmptyState compact（524「保留」裁决由 557
       批覆盖，统一件合并口径），计数 3→4；三处原有形态锚与裸类名负锁不变 */
    expect((asv.match(/<EmptyState/g) || []).length).toBe(4);
    expect(asv).toMatch(/<EmptyState v-if="loadErr" compact :icon="AlertTriangle" text="analysis 加载失败" :hint="loadErr">/);
    expect(asv).toMatch(/<EmptyState v-else-if="!loaded" compact :icon="Info"/);
    expect(asv).toMatch(/<EmptyState v-else compact :icon="Search" text="无匹配的分析组件"/);
    expect(asv).not.toMatch(/class="as-empty"/);
    expect(asv).not.toMatch(/\.as-empty \{/);
  });
  it('MappingDesignerView：四处 md-empty 全量合并，分支顺序与文案语义保留', () => {
    expect((mdv.match(/<EmptyState/g) || []).length).toBe(4);
    expect(mdv).toMatch(/<EmptyState v-else-if="!tree\.length && loadErr" compact :icon="ShieldAlert"/);
    expect(mdv).toMatch(/<EmptyState v-else-if="!tree\.length && loaded" compact :icon="FolderTree"/);
    expect(mdv).toMatch(/<EmptyState v-else-if="!tree\.length" compact :icon="RefreshCw" text="未加载 · 输入 index 并点击「加载」" action-text="立即加载" @action="doLoad" \/>/);
    expect(mdv).toMatch(/<EmptyState v-if="!picked" compact :icon="ChevronRight" text="选中字段查看详情" \/>/);
    expect(mdv).not.toMatch(/class="md-empty/);
    expect(mdv).not.toMatch(/\.md-empty \{/);
  });
});

/* ═══════════ 模板编译冒烟（源码锁照不住 SFC 模板语法；import 即触发 plugin-vue 编译） ═══════════ */
describe('524 改动视图 SFC 编译冒烟', () => {
  /* 五百五十一批提额备案：该冒烟单跑冷变换实测 5.45s（551 改后）/5.76s（551 前原态，git stash A/B
     实测）——双态均贴 5s 默认帽超时，与视图改动无关（JsonArea→monaco 机器冷变换链，同 describe
     AnalyzeView 冒烟 529 批同因提额 15s 在册先例；8s 档余量 <1.5× 不足，从同链先例 15s）。
     1319d：实测门口又涨了——另两条同链冒烟在并发门禁的机器负载下 15s 与 5s **双双贴帽**，
     而单文件冷跑 29/29 全绿（23.3s 总时长，其中这两条各 12.5s / 4.8s）。
     这两条只验「模块能被 plugin-vue 编译出来」，与任何断言逻辑无关，纯受机器冷变换速度支配；
     给到 30s 留足 2× 余量，避免把机器抖动记成产品红灯。 */
  it('MappingDesignerView：EmptyState 分支模板可编译、模块可加载', { timeout: 30000 }, async () => {
    const m = await import('../views/MappingDesignerView.vue');
    expect(m.default).toBeTruthy();
  });
  it('ReconcileReportDrawer：漏斗工具行模板可编译、模块可加载', { timeout: 30000 }, async () => {
    const m = await import('../components/ReconcileReportDrawer.vue');
    expect(m.default).toBeTruthy();
  });
  /* 五百二十九批：AnalyzeView 换 QRT rows 型后模块图扩（+QueryResultTable 链），
     monaco 机器冷变换贴 5s 默认帽——冒烟提额 15s */
  it('AnalyzeView：PageHeader/CurrentIdxChip/token 过滤模板可编译、模块可加载', { timeout: 15000 }, async () => {
    const m = await import('../views/AnalyzeView.vue');
    expect(m.default).toBeTruthy();
  });
});

/* ═══════════ T3 运行时：TasksView 深链高亮 + kw 过滤（挂载） ═══════════ */
const tasksFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterTasks: (...args: any[]) => tasksFn(...args),
    },
  };
});

const TV_TASK = {
  taskId: 'node-es-01:123', node: 'node-es-01', action: 'indices:data/write/reindex',
  description: 'reindex from [a] to [b]', parentTaskId: 'unset',
  startTimeMillis: 0, runningTimeNanos: 2_000_000_000, cancellable: true, status: {},
};

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountTasks(query: Record<string, string> = {}) {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }, { path: '/tasks', component: { template: '<div/>' } }],
  });
  await router.push({ path: '/', query });
  await router.isReady();
  const { default: TasksView } = await import('../views/TasksView.vue');
  const app = createApp({ render: () => h(TasksView as any) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function setInput(el: HTMLInputElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('TasksView 深链与 kw 过滤（524 批，挂载）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    location.hash = '#/';
    localStorage.clear();
    sessionStorage.clear();
    tasksFn.mockReset();
  });

  it('?taskId= 命中行带 .tv-hit 高亮与 data-task-id，其余行不高亮', async () => {
    tasksFn.mockResolvedValue([
      TV_TASK,
      { ...TV_TASK, taskId: 'node-es-02:456', action: 'indices:data/read/search' },
    ]);
    const { app, host } = await mountTasks({ taskId: 'node-es-01:123' });
    const hit = host.querySelector('.tv-node.tv-hit');
    expect(hit, '深链命中行必须带高亮类').toBeTruthy();
    expect(hit!.getAttribute('data-task-id')).toBe('node-es-01:123');
    expect(host.querySelectorAll('.tv-node.tv-hit').length).toBe(1);
    app.unmount();
  });

  it('kw 输入按 taskId/description 过滤行并 MarkText 命中，清空恢复全量', async () => {
    tasksFn.mockResolvedValue([
      TV_TASK,
      { ...TV_TASK, taskId: 'node-es-02:456', action: 'indices:data/read/search', description: 'search scroll' },
    ]);
    const { app, host } = await mountTasks();
    expect(host.querySelectorAll('.tv-node').length).toBe(2);
    const kw = host.querySelector<HTMLInputElement>('.tv-kw');
    expect(kw, 'kw 过滤输入必须在工具行').toBeTruthy();
    setInput(kw!, 'reindex');
    await settle();
    expect(host.querySelectorAll('.tv-node').length).toBe(1);
    expect(host.querySelector('.tv-node .tv-node-desc mark'), '命中描述列应有 <mark> 高亮').toBeTruthy();
    expect(host.querySelector('.tv-node')!.getAttribute('data-task-id')).toBe('node-es-01:123');
    setInput(kw!, 'zzz_no_hit');
    await settle();
    expect(host.querySelectorAll('.tv-node').length).toBe(0);
    expect(host.textContent).toContain('无匹配任务');
    setInput(kw!, '');
    await settle();
    expect(host.querySelectorAll('.tv-node').length).toBe(2);
    app.unmount();
  });
});
