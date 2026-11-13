/**
 * 五百六十批 工蚁E（轨4·统一件改用+去重复）看守。
 *
 *  ① SearchFilterBar 改用 6 面（全站第 6~11 胞收官）：IlmView ilm-input / TemplatesView tv2 过滤框 /
 *     SearchTemplatesView st-list-filter / AliasesView alv-input / TaskTreeView tt-filter /
 *     ClusterSettingsView cs-filter——私造 input 换统一件（559 cd-kw-inp/tv-kw 先例：v-model 接原 ref
 *     零触、placeholder 逐字保留兼作 aria-label、Esc 清空/Enter 检索内建语义对齐、胶囊壳归组件单源）；
 *     挂载 spec 类锚随 input-class 保留在 input 上（558b tv-kw 同路径）。
 *  ② ConfigDriftView 清单角标改用 StatusPill（558b 回滚件解禁重做：tone 走 cdVerdictPill 映射消费；
 *     定位壳外挂保留）+ .cd-bucket 三桶壳退役（约定④ border-top 分节承接）。
 *  ③ TopBar 健康 pill 改用 StatusPill（healthCls→tone 映射）+ 1000px 非标断点台账备案（勿改行为）。
 *  ④ 手写空态合并：WorkspaceView ws-w-empty → EmptyState compact+action（clockTimer 补
 *     visibilitychange hidden 守卫）；PluginsView pl-empty-sub 内芯 EmptyState（td/colspan 外壳保留）。
 *  ⑤ OverviewView 红壳合并 err-bar 单源（ov-loaderr/ov-stuck role=alert；三源 reason 裸拼→
 *     friendlyEsError）；GuardedActionButton .ga-error 合并 err-bar 形态。
 *  ⑥ AliasesView/LifecycleView 写类表单合并 PickCurrentIdxBtn（558 五视图先例：emits pick 逐字锚，
 *     @pick 显式覆盖口）+ AliasesView filter JsonArea 视图侧 :deep 退壳。
 *  ⑦ friendlyEsError 接线 grep 锁（IlmView ilm/explain + LifecycleView 四连，前缀动作词保留）。
 *
 * 走源文本匹配理由同 lrBarSingleTrack.spec.ts:26-29：happy-dom 下 scoped <style> 不参与计算，
 * 布局/接线断言只能是源文本断言；剥注释同 emptyStatePadding.spec.ts:29 教训——注释字面不算数。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const SFB_IMPORT = "import SearchFilterBar from '../components/SearchFilterBar.vue'";

/* ═══════════ ① SearchFilterBar 改用 6 面 ═══════════ */

describe('560①：六面手写过滤框改用 SearchFilterBar 统一件（placeholder 逐字保留）', () => {
  it('IlmView：ilm-input 改用（Enter 定向转出 onHitKey；min() 内联宽钳制随根透传）', () => {
    const s = read('../views/IlmView.vue');
    expect(s).toContain(SFB_IMPORT);
    expect(s, 'placeholder 逐字保留（兼作 aria-label）')
      .toContain('<SearchFilterBar v-model="filter" class="ilm-input" placeholder="按策略名过滤" style="width:min(200px,100%)" @enter="onHitKey" />');
    expect(s, '手写 ilm-input 输入框退役').not.toContain('<input v-model="filter" class="ilm-input"');
    expect(s, 'Esc 清空由组件内建承接（filterEscClear379 同步更新口径）').not.toContain(`@keydown.esc.prevent="filter = ''"`);
    expect(s, '手写输入框皮退役归 .sfb 胶囊壳单源（bg 底不回流）').not.toMatch(/\.ilm-input \{[^}]*background/);
    expect(s, '高度内衬保留（26px 现行，高度链零动）').toMatch(/\.ilm-input \{[^}]*height: 26px;/);
  });

  it('TemplatesView：tv2 过滤框改用（tv2-input 类保留给新建模板名输入，过滤面走新锚）', () => {
    const s = read('../views/TemplatesView.vue');
    expect(s).toContain(SFB_IMPORT);
    expect(s).toContain('<SearchFilterBar v-model="filter" class="tv2-kw-wrap" input-class="tv2-kw" placeholder="过滤名字（子串）" @enter="onHitKey" />');
    expect(s, '手写过滤框退役（新建名 combobox 的 tv2-input 不在此域）').not.toContain('<input v-model="filter" class="tv2-input"');
    expect(s, 'min() 极窄钳制同步更新（paneShellWave547 锁面）').toMatch(/\.tv2-kw-wrap \{[^}]*min-width: min\(200px, 100%\);/);
  });

  it('SearchTemplatesView：st-list-filter 改用（类锚随 input-class 保留在 input 上，stTplTiersFilter 同路径）', () => {
    const s = read('../views/SearchTemplatesView.vue');
    expect(s).toContain(SFB_IMPORT);
    expect(s).toContain('<SearchFilterBar v-else v-model="tplFilter" class="st-list-sfb" input-class="st-list-filter" placeholder="按名字过滤" />');
    expect(s, '手写过滤框退役').not.toContain('<input v-else v-model="tplFilter"');
    expect(s, '::placeholder 弱化档同步更新').toMatch(/\.st-list-filter::placeholder \{ opacity: \.5; \}/);
  });

  it('AliasesView：alv-input 改用（类锚随 input-class 保留在 input 上，w5IndexWorkspace530 同路径）', () => {
    const s = read('../views/AliasesView.vue');
    expect(s).toContain(SFB_IMPORT);
    expect(s).toContain('<SearchFilterBar v-model="query" class="alv-kw-wrap" input-class="alv-input" placeholder="过滤 alias / index 名（支持子串）" @enter="onHitKey" />');
    expect(s, '手写过滤框退役').not.toContain('<input\n          v-model="query"');
    expect(s, 'alv-input 手写皮退役（bg1 底不回流，落位迁 alv-kw-wrap）').not.toMatch(/\.alv-input \{[^}]*background/);
  });

  it('TaskTreeView：tt-filter 改用（min-width min(220px,100%) 钳制同步更新，smallScreenFloor547 锁面）', () => {
    const s = read('../views/TaskTreeView.vue');
    expect(s).toContain(SFB_IMPORT);
    expect(s).toContain('<SearchFilterBar v-model="filter" class="tt-filter" placeholder="按 action / description / node 过滤…" />');
    expect(s, '手写过滤框退役').not.toContain('<input v-model="filter" class="tt-filter"');
    expect(s).toMatch(/\.tt-filter \{[^}]*min-width: min\(220px, 100%\); \}/);
  });

  it('ClusterSettingsView：cs-filter 改用（min-width min(210px,100%) 钳制同步更新，smallScreenFloor547 锁面）', () => {
    const s = read('../views/ClusterSettingsView.vue');
    expect(s).toContain(SFB_IMPORT);
    expect(s).toContain('<SearchFilterBar v-model="filter" class="cs-filter" placeholder="按 key 过滤…只显示白名单 & 已改" />');
    expect(s, '手写过滤框退役').not.toContain('<input v-model="filter" class="cs-filter"');
    expect(s).toMatch(/\.cs-filter \{[^}]*min-width: min\(210px, 100%\); \}/);
  });
});

/* ═══════════ ② ConfigDrift：角标 StatusPill + cd-bucket 壳退役 ═══════════ */

describe('560②：ConfigDrift 清单角标改用 StatusPill（558b 回滚件解禁重做）+ cd-bucket 退役', () => {
  it('清单角标 StatusPill 改用（tone 走 cdVerdictPill 映射消费；文案逐字）', () => {
    const s = read('../views/ConfigDriftView.vue');
    expect(s).toContain('<StatusPill v-if="verdicts[k.indexKey]" class="cd-verdict" :tone="cdVerdictPill(verdicts[k.indexKey])"');
    expect(s, '手写 pill 形态退役（558b 负锁同步更新翻转）').not.toContain('class="cd-verdict pill"');
    expect(s, 'cdVerdictPill 映射本体保留消费').toMatch(/const cdVerdictPill = \(v: string\) => \(CD_VERDICT_PILL\[v\] \|\| 'n'\)/);
  });
  it('定位壳外挂保留（absolute right/top 角标形态，useCurrentIdxWritePages525:211 锁面零触）', () => {
    const s = read('../views/ConfigDriftView.vue');
    expect(s).toMatch(/\.cd-verdict \{ position: absolute; right: 10px; top: 10px; \}/);
    expect(s, '本地档配色不回流').not.toMatch(/\.cd-verdict\.[a-z]+ \{/);
  });
  it('cd-bucket 三桶壳退役：border+radius 退役 → border-top 分节承接（约定④），padding 盒模型等值', () => {
    const s = strip(read('../views/ConfigDriftView.vue'));
    expect(s, 'border-top 分节承接').toMatch(/\.cd-bucket \{ border-top: 1px solid var\(--border\); padding: var\(--sp-2\) var\(--sp-3\);/);
    expect(s, '整框圆角不回流').not.toMatch(/\.cd-bucket \{[^}]*border-radius/);
    expect(s, '三桶模板面零触（v-if 门控，空态不留整块空框）').toContain('class="cd-bucket"');
  });
});

/* ═══════════ ③ TopBar：健康 pill 改用 + 断点台账 ═══════════ */

describe('560③：TopBar 健康 pill 改用 StatusPill + 1000px 断点台账备案', () => {
  it('健康徽标改用（healthCls→tone 映射 g/y/r，label 语义=health 原文保留）', () => {
    const s = read('../components/TopBar.vue');
    expect(s).toContain("import StatusPill from './StatusPill.vue'");
    expect(s).toContain('<StatusPill v-if="store.pickedInfo" :tone="healthCls(store.pickedInfo.health)" :label="store.pickedInfo.health" />');
    expect(s, '手写 pill 形态退役').not.toContain('class="pill" :class="healthCls');
  });
  it('1000px 非标断点只备案不改行为（R66 866px iframe 实测台账在册）', () => {
    const s = read('../components/TopBar.vue');
    expect(s, '1000px 档原样在场（行为零触）').toContain('@media (max-width: 1000px)');
    expect(s, '台账备案（R66 866px iframe 实测 + 非标断点在册说明）').toMatch(/台账[^\n]*1000px|1000px[^\n]*台账|R66[^\n]*866px[^\n]*台账/);
  });
});

/* ═══════════ ④ 手写空态合并 EmptyState + clockTimer 守卫 ═══════════ */

describe('560④：手写空态合并 EmptyState compact + WorkspaceView 秒表 hidden 守卫', () => {
  it('WorkspaceView：ws-w-empty → EmptyState compact + action（一键体检语义保留）', () => {
    const s = strip(read('../views/WorkspaceView.vue'));
    expect(s).toContain('<EmptyState v-if="!hResult" compact :icon="HeartPulse" text="尚未体检" action-text="一键体检" @action="loadHealth" />');
    expect(s, '手写空态壳退役（模板+样式清零，注释字面不算数）').not.toContain('ws-w-empty');
    expect(s, 'EmptyState action 位无 disabled 档——防重入守卫迁 loadHealth').toMatch(/async function loadHealth\(\) \{\s*if \(hBusy\.value\) return;/);
  });
  it('五百六十一批同步更新：pl-empty-sub 子空态随矩阵表换 QRT rows 型退役（empty-text 文案逐字）', () => {
    const s = read('../views/PluginsView.vue');
    expect(s, '空态文案逐字保形（归 QRT 内建空态）').toContain('empty-text="未检测到插件"');
    expect(s, 'td/colspan 子空态外壳退役（负锁）').not.toContain('pl-empty-sub');
  });
  it('WorkspaceView：clockTimer 补 visibilitychange hidden 守卫（jobTracker onVisChange 范式）', () => {
    const s = read('../views/WorkspaceView.vue');
    expect(s).toMatch(/function onVisChange\(\) \{\s*if \(document\.hidden\) \{/);
    expect(s).toContain("document.addEventListener('visibilitychange', onVisChange)");
    expect(s).toContain("document.removeEventListener('visibilitychange', onVisChange)");
  });
});

/* ═══════════ ⑤ Overview/GAB 红壳合并 err-bar 单源 ═══════════ */

describe('560⑤：OverviewView 双条 + GuardedActionButton 错误盒合并 err-bar 档', () => {
  it('OverviewView：ov-loaderr → err-bar（role=alert + 重试钮，theme.css .err-bar 档）', () => {
    const s = strip(read('../views/OverviewView.vue'));
    expect(s).toContain('<div v-if="loadErr" role="alert" class="err-bar rise-in">');
    expect(s, '手写红壳退役（本地 bg/border/radius 清零）').not.toContain('.ov-loaderr {');
    expect(s, '重试钮保留').toMatch(/class="err-bar rise-in">[^]*?重试/);
  });
  it('OverviewView：ov-stuck → err-bar warn 档（role=alert；红→黄 token 视图侧覆写）', () => {
    const s = strip(read('../views/OverviewView.vue'));
    expect(s).toContain('<div v-if="stuckJobs.length" role="alert" class="err-bar ov-stuck">');
    expect(s, '手写警示壳退役（err-soft/border/radius 私造三件套不回流，本地只留 warn tone 换色）')
      .not.toMatch(/\.ov-stuck \{[^}]*err-soft/);
    expect(s, 'warn 语义档覆写在场').toMatch(/\.ov-stuck \{ background: var\(--warn-soft\); border-color: var\(--warn-line\); color: var\(--warn\); \}/);
  });
  it('OverviewView：err-bar 三源 reason.message 裸拼 → friendlyEsError', () => {
    const s = read('../views/OverviewView.vue');
    expect(s).toContain("import { friendlyEsError } from '../utils/esError'");
    /* 锁面随迁：三处硬编码 errs.push 已重构为 pushErr 循环单源（行为保留——
       label 前缀 + friendlyEsError 友好化 + errs.push 链路不变，权限类静默为增量） */
    expect(s).toContain("const pushErr = (label: string, reason: unknown, gated: boolean) => {");
    expect(s).toContain("const text = label + '：' + friendlyEsError(String(r?.message ?? reason));");
    expect(s).toContain('errs.push(text)');
  });
  it('GuardedActionButton：.ga-error 合并 err-bar 形态（role=alert；类锚保留，guardedBtn499 同路径）', () => {
    const s = read('../components/GuardedActionButton.vue');
    expect(s).toContain('<div v-if="error" role="alert" class="err-bar ga-error">');
    expect(s, '本地红壳三件套退役归 theme 单源').not.toMatch(/\.ga-error \{[^}]*err-soft/);
    expect(s, '全文 pre 兜底保留').toContain('class="ga-error-pre"');
  });
});

/* ═══════════ ⑥ PickCurrentIdxBtn 合并 + JsonArea :deep 退壳 ═══════════ */

describe('560⑥：Aliases/Lifecycle 写类表单合并 PickCurrentIdxBtn（558 先例）+ alv filter 面退壳', () => {
  it('AliasesView：cIndex 表单合并（emits pick 逐字锚由组件保真，@pick 显式覆盖口）', () => {
    const s = read('../views/AliasesView.vue');
    expect(s).toContain("import PickCurrentIdxBtn from '../components/PickCurrentIdxBtn.vue'");
    expect(s).toMatch(/<IndexPicker v-model="cIndex" placeholder="my-index-v1" \/>\s*<PickCurrentIdxBtn @pick="cIndex = store\.pickedIdx" \/>/);
  });
  it('LifecycleView：rolloverAlias/moveIndex 两表单合并（回填只走显式口，:272 不 follow 口径不变）', () => {
    const s = read('../views/LifecycleView.vue');
    expect(s).toContain("import PickCurrentIdxBtn from '../components/PickCurrentIdxBtn.vue'");
    expect(s).toContain('<PickCurrentIdxBtn @pick="rolloverAlias = store.pickedIdx" />');
    expect(s).toContain('<PickCurrentIdxBtn @pick="moveIndex = store.pickedIdx" />');
  });
  it('AliasesView：filter JsonArea .ja 外框视图侧 :deep 退壳（组件零触）', () => {
    const s = read('../views/AliasesView.vue');
    expect(s).toContain('.alv-f-block :deep(.ja) { border: none; border-radius: 0; }');
  });
});

/* ═══════════ ⑦ friendlyEsError 接线 grep 锁 ═══════════ */

describe('560⑦：裸 err notify 合并 friendlyEsError（前缀动作词保留）', () => {
  it('IlmView：ilm/explain 裸 err 接线（ilm/move 557 锁面零触）', () => {
    const s = read('../views/IlmView.vue');
    expect(s).toContain("'ilm/explain: ' + friendlyEsError(String(e?.message ?? e))");
    expect(s, 'ilm/move 先例锁面零触').toContain("'ilm/move 失败：' + friendlyEsError(String(e?.message ?? e))");
  });
  it('LifecycleView：四连裸 err 接线（启动/停止/Rollover/迁移步骤前缀逐字保留）', () => {
    const s = read('../views/LifecycleView.vue');
    expect(s).toContain("'ILM 启动失败：' + friendlyEsError(String(e?.message ?? e))");
    expect(s).toContain("'ILM 停止失败：' + friendlyEsError(String(e?.message ?? e))");
    expect(s).toContain("'Rollover 失败：' + friendlyEsError(String(e?.message ?? e))");
    expect(s).toContain("'迁移步骤失败：' + friendlyEsError(String(e?.message ?? e))");
  });
});
