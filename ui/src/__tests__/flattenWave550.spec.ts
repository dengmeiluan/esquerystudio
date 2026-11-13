/**
 * 五百五十批·轨4（工蚁）：全站扁平化扫荡第七波 · 统一组件化收尾 · 契约备案。
 *
 * 仿 flattenWave546/538 静态源码断言范式（happy-dom 不挂载）：
 * ① LifecycleView 页头状态徽标改用 StatusPill 统一件——全站最后一个私造状态胶囊合并
 *    （meta-err/meta-ok/meta-warn 文本档退役，err→r/warn→y/ok→g 语义映射；:title 兜底不变）。
 * ② PitScroll pt-card-hd / BulkEditor be-card-hd 卡头并 fs-head 行首横排档
 *    （UpdateByQueryView uq-card-hd 538 已改先例：fs-xs/650/tx1/.02em + 5px--sp-2 行距 +
 *    border-bottom 分界；pt 模板头行随先例去 span 裸文本，be 模板已是先例 span+hd-r
 *    形态且被 flattenWave534:88/bulkEditorWorkbench409:21/flattenWave538:167 三锁逐字钉住，
 *    只并样式档不动模板）。
 * ③ IlmView 死 .empty CSS 规则删除（模板零引用实证：两处空态早已 EmptyState 化，307/sweep524 锚）。
 * ④ DiagView dg-alloc-row 键名裸 b（×4）与 HealthReportView hr-alloc-line 键名裸 b →
 *    .dg-k 语义类（形取就近既有 .dg-alloc-row b 规则逐字同步更新：tx0/600/margin-right，视觉零变化；
 *    HealthReport 用同款类名对齐）。
 * ⑤ IndexSettingsView is-kind 裸 .pill n 徽标 + AnalysisSettingsView syn/flt 徽标 → 收口
 *    StatusPill 统一件（550 裁定推翻 componentUnify530「带图标 syn 与 violet 档形态不等价不换」
 *    备案：theme.css 无 .tag 原语可作替代面，统一件是唯一收口；syn 的 BookText 图标随统一件
 *    无图标位退役，as-badge/syn/flt 锚类保留——色档与 flex:none 落位由既有 scoped 规则继续承担，
 *    pillSingleTrack MERGED 看守不受影响）；三处同一方案（is-kind+syn+flt），tk 既有改用不动。
 * ⑥ 统计值并 meta-num 全局数值档（mono+tabular-nums，theme.css:185 单源）：
 *    IndexOptimizer io-seg-stats / ProfileFlame pf-sum-cell ×4 / HealthReport hr-hero-r 三页统一；
 *    合法语义强调的警示 b（IlmView 引导列表/IndexOptimizer force_merge 警示/Adhoc 三处警示）保留不动。
 * ⑦ SnapshotsView 手写 sv-repo-meta chip 退役并 MetaStrip mini 档（Server 图标随统一件无图标位
 *    退役；:693 私造样式同步更新删除）；顺带 err-bar 改用 errPreHtml+errMeta 双参（DiagView/TaskTree
 *    547 铺装同口径：loadErrRaw 原始对象旁路，code/endpoint 元信息行有则显，空 meta 与单参逐字一致）。
 * ⑧ AdhocRebuildView 步骤标题 b→strong 五处（:82/:109/:254/:260/:266 纯语义清理；b{font-weight:650}
 *    全站兜底不盖 strong——.strat strong 补 font-weight:650 字重同步更新保视觉零变化，两处 hd 规则
 *    本就自带 650；:291/:353/:438 警示 b 保留）。
 * ⑨ PitScroll QRT 宿主 refreshable 备案：侦察无既有「重查」函数（doStart 是拉取循环启停，
 *    reset 会清缓冲，均非 SystemView run()/DslQueryView runQuery() 语义的纯重查）——按批次
 *    铁律「不许为接 refreshable 新造函数」，只备案不接线（下方负锁防误接）。
 *
 * 范围铁律：纯视觉/语义层小刀——模板结构语义、高度链（max-height/height 定行）、六步卡结构零变动。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① LifecycleView 状态胶囊合并 StatusPill ═══════════ */

describe('五百五十批①：LifecycleView 状态 b 改用 StatusPill 统一件', () => {
  const lc = () => read('../views/LifecycleView.vue');

  it('StatusPill 消费在场：err 失败档 tone=r（:title 全文兜底不变）+ RUNNING→g/其余→y 语义映射', () => {
    const s = lc();
    expect(s, 'StatusPill 统一件 import 在场').toContain("import StatusPill from '../components/StatusPill.vue';");
    expect(s, '失败档改用（err→r 映射，title 记名兜底）')
      .toContain('<StatusPill v-if="stsErr" tone="r" label="状态拉取失败" :title="stsErr" />');
    expect(s, '运行态语义映射（RUNNING→g，STOPPED 人为暂停仍 y 档）')
      .toMatch(/<StatusPill v-else :tone="ilmSts\?\.operation_mode === 'RUNNING' \? 'g' : 'y'" :label="ilmSts\?\.operation_mode \|\| '—'" \/>/);
  });

  it('meta-* 私造状态 b 全形态退役（模板消费与旧备案注释不回流）', () => {
    const s = lc();
    expect(s, 'meta-err b 消费退役').not.toMatch(/<b[^>]*class="meta-err"/);
    expect(s, 'meta-ok/meta-warn 三元 b 消费退役').not.toMatch(/<b v-else :class=/);
    expect(s, '页头模板段不再有裸 b 徽标').not.toMatch(/lc-hd-sub[\s\S]{0,400}<b/);
  });
});

/* ═══════════ ② 两卡头并 fs-head 行首横排档 ═══════════ */

describe('五百五十批②：pt-card-hd / be-card-hd 并 fs-head 行首横排档（uq-card-hd 538 先例）', () => {
  const HD_FORM = '.pt-card-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: 5px var(--sp-2); border-bottom: 1px solid var(--border); font-size: var(--fs-xs); font-weight: 650; color: var(--tx1); letter-spacing: .02em; }';

  it('PitScrollView：卡头样式并 uq 先例档逐字在场；四头条数不变；模板头行随先例去 span 裸文本', () => {
    const pt = read('../views/PitScrollView.vue');
    expect(pt, 'fs-head 行首横排档逐字（flattenWave538:109 旧 fs-sm 档同步更新）').toContain(HD_FORM);
    expect(pt, '旧 fs-sm 卡头档退役').not.toContain('.pt-card-hd { padding: var(--sp-2) var(--sp-3);');
    expect((pt.match(/class="pt-card-hd"/g) || []).length, '四张分节各一头条（538 正锁随行复核）').toBe(4);
    expect(pt, '标题-only 头行裸文本（uq-card-hd 先例模板形态）').toContain('<div class="pt-card-hd">参数</div>');
    expect(pt, '进度头行裸文本').toContain('<div class="pt-card-hd">进度</div>');
    /* 1439：预览头追加「条件已修改」芯片——裸文本头不变，尾随标签为条件渲染 */
    expect(pt, '预览头行裸文本').toContain('<div class="pt-card-hd">预览（最近 100 条）');
  });

  it('BulkEditorView：卡头样式并 uq 先例档逐字在场；span+hd-r 先例模板结构不动（三锁逐字锚）', () => {
    const be = read('../views/BulkEditorView.vue');
    expect(be, 'fs-head 行首横排档逐字（与 pt 同档同语言）')
      .toContain('.be-card-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: 5px var(--sp-2); border-bottom: 1px solid var(--border); font-size: var(--fs-xs); font-weight: 650; color: var(--tx1); letter-spacing: .02em; }');
    expect(be, '旧 fs-sm 卡头档退役').not.toContain('justify-content: space-between; padding: var(--sp-2) var(--sp-3); border-bottom');
    expect(be, '参数头条 span 形态不动（flattenWave534:88/bulkEditorWorkbench409:21/538:167 三锁同源）')
      .toContain('<div class="be-card-hd"><span>参数</span></div>');
  });
});

/* ═══════════ ③ IlmView 死 .empty 规则删除 ═══════════ */

describe('五百五十批③：IlmView 死 .empty CSS 规则删除（模板零引用实证）', () => {
  it('scoped .empty 规则清零；模板无 class="empty" 消费（空态归 EmptyState 统一件）', () => {
    const ilm = read('../views/IlmView.vue');
    expect(ilm, '死规则不回流').not.toMatch(/\.empty \{/);
    expect(ilm, '模板零引用实证（空态两处均已 EmptyState 化）').not.toContain('class="empty"');
    expect(ilm, '空态统一件消费仍在（ilmEmpty307 锚随行复核）').toContain('<EmptyState');
  });
});

/* ═══════════ ④ 键名排版 dg-k 语义类 ═══════════ */

describe('五百五十批④：DiagView/HealthReportView 键名裸 b 收口 .dg-k 语义类', () => {
  it('DiagView：dg-alloc-row 四处键名 span.dg-k 在场，裸 b 键名退役', () => {
    const dg = read('../views/DiagView.vue');
    expect(dg).toContain('<span class="dg-k">index：</span>');
    expect(dg).toContain('<span class="dg-k">current_state：</span>');
    expect(dg).toContain('<span class="dg-k">reason：</span>');
    expect(dg).toContain('<span class="dg-k">can_allocate：</span>');
    expect(dg, '键名裸 b 退役').not.toMatch(/<b>(index|current_state|reason|can_allocate)：<\/b>/);
  });

  it('.dg-k 样式取就近既有 .dg-alloc-row b 形态逐字同步更新（视觉零变化）；旧元素选择器退役', () => {
    const dg = read('../views/DiagView.vue');
    expect(dg, 'tx0/600/margin-right 形态逐字（原 .dg-alloc-row b 规则同步更新）')
      .toContain('.dg-k { color: var(--tx0); font-weight: 600; margin-right: var(--sp-1); }');
    expect(dg, '旧元素选择器随 b 退役').not.toContain('.dg-alloc-row b');
  });

  it('HealthReportView：hr-alloc-line 键名同款类名对齐（.dg-k 规则本页落地）', () => {
    const hr = read('../views/HealthReportView.vue');
    expect(hr).toContain('<span class="dg-k">reason：</span>');
    expect(hr).toContain('.dg-k { color: var(--tx0); font-weight: 600; margin-right: var(--sp-1); }');
  });
});

/* ═══════════ ⑤ 三处徽标统一 StatusPill ═══════════ */

describe('五百五十批⑤：is-kind / syn / flt 三处徽标统一收口 StatusPill（同一方案）', () => {
  it('IndexSettingsView：is-kind 改用 StatusPill（kind→tone 语义映射），k-* 手写色档退役', () => {
    const s = read('../views/IndexSettingsView.vue');
    expect(s, 'StatusPill 改用（is-kind 锚类保留，pillSingleTrack MERGED 看守）')
      .toContain('<StatusPill v-if="kindOf(d.key)" class="is-kind" :tone="kindTone(kindOf(d.key))" :label="kindText(kindOf(d.key))" />');
    expect(s, 'kindTone 伴生映射在场').toMatch(/function kindTone\(kind: string\): 'g' \| 'y' \| 'r' \{/);
    expect(s, '裸 .pill n is-kind 退役（semanticTier531:151 旧锚同步更新）').not.toContain('class="pill n is-kind"');
    expect(s, 'k-* 手写文字色档退役（色归 tone 单源）').not.toMatch(/\.is-kind\.k-/);
    expect(s, 'is-kind 落位锚保留').toContain('.is-kind { margin-left: auto; flex-shrink: 0; }');
  });

  it('AnalysisSettingsView：syn/flt 两枚改用 StatusPill（tk 既有改用不动），BookText 图标随无槽位退役', () => {
    const s = read('../views/AnalysisSettingsView.vue');
    expect(s, 'syn 徽标改用（as-badge syn 锚保留，dv-pink 色档既有规则继续承担）')
      .toContain('<StatusPill v-if="isSynonymFilter(cfg)" class="as-badge syn" tone="b" :label="\'synonym · \' + ((cfg as any).synonyms || []).length + \' 条\'" />');
    expect(s, 'flt 徽标改用（as-badge flt 锚保留）')
      .toContain('<StatusPill v-if="(cfg as any)?.filter?.length" class="as-badge flt" tone="b" :label="((cfg as any).filter.length) + \' filter\'" />');
    expect(s, 'syn/flt 裸 pill 退役（componentUnify530 旧锚同步更新）').not.toContain('class="pill b as-badge syn"');
    expect(s, 'violet 档裸消费退役').not.toContain('pill violet');
    expect(s, 'tk 徽标既有改用不动（530 锚随行复核）').toContain('<StatusPill v-if="(cfg as any)?.tokenizer" tone="y"');
    expect(s, 'BookText 图标随统一件无图标位退役（import 一并清）').not.toContain('BookText');
    expect(s, 'as-badge 锚落位规则保留（pillSingleTrack MERGED）').toContain('.as-item-hd .as-badge { flex: none; }');
  });
});

/* ═══════════ ⑥ 统计值并 meta-num 数值档（三页统一） ═══════════ */

describe('五百五十批⑥：统计值并 meta-num 全局数值档（mono+tabular，theme.css 单源）', () => {
  it('IndexOptimizerView：io-seg-stats 容器挂 meta-num；警示语义 b 保留不动', () => {
    const io = read('../views/IndexOptimizerView.vue');
    expect(io).toContain('<div class="io-seg-stats meta-num">');
    expect(io, 'force_merge 警示 b 保留（合法语义强调豁免）').toContain('<b>force_merge 是重操作</b>');
  });

  it('ProfileFlameView：pf-sum-cell 四格全挂 meta-num；650 字重档不受影响（themeDiscipline525 锚）', () => {
    const pf = read('../views/ProfileFlameView.vue');
    expect((pf.match(/class="pf-sum-cell meta-num"/g) || []).length, '三格常态').toBe(3);
    expect(pf, 'warn 格同步更新').toContain('class="pf-sum-cell warn meta-num"');
    expect(pf, '.pf-sum-cell b 650 字重规则原样（themeDiscipline525:174 锁随行复核）')
      .toMatch(/\.pf-sum-cell b \{[^}]*font-weight: 650/);
  });

  it('HealthReportView：hr-hero-r 容器挂 meta-num（摘要五行值统一档）', () => {
    const hr = read('../views/HealthReportView.vue');
    expect(hr).toContain('<div class="hr-hero-r meta-num">');
  });
});

/* ═══════════ ⑦ SnapshotsView MetaStrip mini + errMeta 双参 ═══════════ */

describe('五百五十批⑦：SnapshotsView sv-repo-meta 退役并 MetaStrip；err-bar 双参改用', () => {
  it('sv-repo-meta chip 全形态退役（模板消费 + :693 私造样式 + Server 图标 import）', () => {
    const sv = read('../views/SnapshotsView.vue');
    expect(sv, 'chip 模板消费退役').not.toContain('sv-repo-meta');
    expect(sv, 'Server 图标随统一件无图标位退役').not.toContain('<Server :size="11" />');
    expect(sv, 'lucide import 清理（孤儿防呆）').not.toMatch(/import \{[^}]*\bServer\b[^}]*from 'lucide-vue-next'/);
    expect(sv, 'MetaStrip mini 档在场（repo type 值亮+标签暗）').toContain("<MetaStrip v-if=\"currentRepoMeta\" :items=\"[{ value: currentRepoMeta.type, label: 'type' }]\" />");
    expect(sv, 'MetaStrip 统一件既有消费不动（页头统计串）').toContain('class="sv-meta"');
  });

  it('err-bar 改用 errPreHtml+errMeta 双参（547 DiagView/TaskTree 口径：loadErrRaw 原始对象旁路）', () => {
    const sv = read('../views/SnapshotsView.vue');
    expect(sv, '双参帮手 import 在场').toContain("import { errPreHtml, errMeta } from '../utils/errPre';");
    expect(sv, 'err-bar v-html 双参').toMatch(/v-html="errPreHtml\(loadErr, errMeta\(loadErrRaw\)\)"/);
    expect(sv, '原始对象旁路声明（runErrRaw 同款范式）').toContain('const loadErrRaw = ref<unknown>(null);');
    expect((sv.match(/loadErrRaw\.value = e;/g) || []).length, '两处 catch 旁路（repo/快照双源）').toBe(2);
    expect(sv, 'friendlyEsError 通道不回退（文案语义保留）').toContain("'快照仓库拉取失败：'");
    expect(sv).toContain("'快照列表拉取失败：'");
  });
});

/* ═══════════ ⑧ AdhocRebuildView 步骤标题 b→strong ═══════════ */

describe('五百五十批⑧：AdhocRebuild 步骤标题 b→strong（纯语义清理，视觉零变化）', () => {
  it('五处步骤标题 strong 化（:82/:109/:254/:260/:266）', () => {
    const adhoc = read('../views/AdhocRebuildView.vue');
    expect(adhoc).toContain('<strong>粘贴期望配置</strong>');
    expect(adhoc).toContain('<strong>直接写期望的 settings / mapping</strong>');
    expect(adhoc).toContain('<strong>A · 增量追平（推荐）</strong>');
    expect(adhoc).toContain('<strong>B · 写阻断窗口</strong>');
    expect(adhoc).toContain('<strong>C · 直切 + 回补报告</strong>');
    expect(adhoc, '旧 b 形态退役').not.toContain('<b>粘贴期望配置</b>');
  });

  it('CSS 选择器随 strong 同步更新；.strat strong 补 650 字重（b 全站兜底不盖 strong）', () => {
    const adhoc = read('../views/AdhocRebuildView.vue');
    expect(adhoc, 'ar-paste-hd 选择器同步更新（rebuildFlat534:40 锁同步更新）')
      .toContain('.ar-paste-hd strong { font-size: var(--fs-md); font-weight: 650; color: var(--tx0); letter-spacing: var(--ls-tight); }');
    expect(adhoc, 'ar-manual-hd 选择器同步更新（rebuildFlat534:41 锁同步更新）')
      .toContain('.ar-manual-hd strong { font-size: var(--fs-md); font-weight: 650; color: var(--tx0); letter-spacing: var(--ls-tight); }');
    expect(adhoc, 'strat 标题档同步更新+字重同步更新（b 全站 650 兜底对 strong 失效）')
      .toContain('.strat strong { font-size: var(--fs-sm); color: var(--tx0); font-weight: 650; }');
    expect(adhoc, '旧元素选择器清零').not.toMatch(/\.(ar-paste-hd|ar-manual-hd|strat) b \{/);
  });

  it('警示语义 b 三处保留不动（合法语义强调豁免）', () => {
    const adhoc = read('../views/AdhocRebuildView.vue');
    expect(adhoc, '写阻断警示 b 保留').toContain('<b>该索引未指定时间字段 —— 业务写入将在整个重建期间被阻断</b>');
    expect(adhoc, '风险头 b 保留').toContain('<b>date 兼容风险</b>');
    expect(adhoc, 'await 警示 b 保留').toContain('<b>业务写入正在被阻断</b>');
  });
});

/* ═══════════ ⑨ PitScroll QRT refreshable 备案（只备案不接线） ═══════════ */

describe('五百五十批⑨：PitScroll QRT 宿主 refreshable 备案（无既有重查函数，不新造）', () => {
  it('负锁：未接 refreshable（doStart 是拉取循环启停非纯重查；为接线新造函数被批次铁律禁止）', () => {
    const pt = read('../views/PitScrollView.vue');
    expect(pt, '侦察备案：无既有纯重查函数，refreshable 不接线（后续批次落重查函数后再议）')
      .not.toContain('refreshable');
  });
});
