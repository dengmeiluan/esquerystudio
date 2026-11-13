/**
 * 五百六十一批（工蚁D2·轨4 收尾）：私造红壳/手写空态合并 + --danger 别名退役 + export-name 补名。
 *
 *  ① AnalyzeView .av-err 私造红壳合并 err-bar（theme.css :554 单源，role=alert 在场；
 *     558b pf-err 先例）——padding/err-soft/radius 三件套退役，.av-err 只留多行富内容
 *     顶对齐与落位节奏；threeStateContract 白名单描述串同步更新（av-err→err-bar，仅描述无断言）；
 *  ② IndexOptimizerView .io-good 手写空态合并 EmptyState compact（约定④ 空态不留整块色框，
 *     Workspace/Plugins 560 批先例）；force_merge toast 纯文本「去任务页看进度」升格 notify
 *     action「看任务」（AdhocRebuild confirmSwitch 范式，文本与 action 去重）；
 *  ③ FavoritesView 两处导入失败裸串人话化（「不是合法的收藏 JSON 文件」/「文件无法读取，
 *     请重试」，原始 message 括注保真）；ConfigDrift scanAllVerdicts 单键失败静默 catch 改
 *     计数（M>0 换 warn 档「N 成功 / M 失败(首 3 键…)」，失败键 verdict 不写三态）；
 *  ④ --danger deprecated 别名退役：四文件七处消费换 var(--err)（theme.css :163 定义行
 *     保留——SqlConsole .sq-alert 禁合并面与 DevTools/LuceneQuery 他工蚁面仍在消费）；
 *  ⑤ export-name 七表补名（527 契约纯属性增量，缺省回落 table-export-* 不动；命名避开
 *     tableKernelWave532 等已锁名）。
 *
 * 走源文本匹配理由同 flattenWave560.spec.ts:20-22：happy-dom 下 scoped <style> 不参与计算，
 * 布局/接线断言只能是源文本断言；剥注释同 emptyStatePadding.spec.ts:29 教训——注释字面不算数。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const av = read('../views/AnalyzeView.vue');
const io = read('../views/IndexOptimizerView.vue');
const fav = read('../views/FavoritesView.vue');
const cd = read('../views/ConfigDriftView.vue');
const be = read('../views/BulkEditorView.vue');
const pl = read('../views/PainlessLabView.vue');
const ws = read('../views/WorkspaceView.vue');
const bw = read('../views/BrowserView.vue');
const sy = read('../views/SystemView.vue');
const pv = read('../views/PluginsView.vue');
const hr = read('../views/HealthReportView.vue');
const st = read('../views/SearchTemplatesView.vue');
const theme = read('../theme.css');
const threeState = read('./threeStateContract.spec.ts');

/* ═══════════ ① AnalyzeView 红壳合并 err-bar（558b pf-err 先例）═══════════ */

describe('561①：AnalyzeView .av-err 私造红壳合并 err-bar', () => {
  it('role=alert 在场 + err-bar 类挂载（v-if="err" 条件保形）', () => {
    expect(av).toContain('<div v-if="err" role="alert" class="err-bar av-err">');
  });
  it('私造红壳三件套退役（padding/err-soft/radius 归 theme.css :554 单源），只留顶对齐', () => {
    const s = strip(av);
    expect(s, '多行富内容顶对齐保留（pf-err 同款）').toMatch(/\.av-err \{[^}]*align-items: flex-start;/);
    expect(s, 'err-soft 底不回流').not.toMatch(/\.av-err \{[^}]*err-soft/);
    expect(s, 'radius 不回流').not.toMatch(/\.av-err \{[^}]*border-radius/);
    expect(s, '私造 padding 不回流').not.toMatch(/\.av-err \{[^}]*padding/);
    expect(s, 'err 色字面不回流（色归 err-bar 单源）').not.toMatch(/\.av-err \{[^}]*color: var\(--err\)/);
  });
  it('threeStateContract 白名单描述串同步更新（av-err→err-bar，描述性文本无断言）', () => {
    expect(threeState).toContain("'AnalyzeView.vue': '手动运行型工作台，err-bar 面板内联透传，重跑即重试'");
  });
});

/* ═══════════ ② IndexOptimizerView 手写空态合并 + toast action ═══════════ */

describe('561②：IndexOptimizerView .io-good 合并 EmptyState compact + force_merge toast action', () => {
  it('io-good 手写空态退役 → EmptyState compact（文案逐字；EmptyState import 在场）', () => {
    const s = strip(io);
    expect(s).toContain('<EmptyState v-if="recs.length === 0" compact :icon="CheckCircle2" text="索引参数已符合推荐配置，无需调整" />');
    expect(s, '手写空态壳退役（模板+样式清零，注释字面不算数）').not.toContain('io-good');
    expect(s, 'EmptyState import 在场').toContain("import EmptyState from '../components/EmptyState.vue'");
  });
  it('force_merge toast 升格 notify action（561「看任务」→ 562 升格「查看任务树」带 taskId 深链，TasksView route.query.taskId 命中高亮白得）', () => {
    /* 五百六十二批同步更新（击穿者：562 工蚁5——toast action 升格 taskId 深链，/tasks 消费端零新契约） */
    expect(io).toMatch(/store\.notify\('success', `force_merge 任务已提交：\$\{target\.value\} → \$\{n\} 段（taskId=\$\{r\?\.taskId\}）`, \{\s*duration: 12000,\s*action: \{ label: '查看任务树', onClick: \(\) => \{ router\.push\(\{ path: '\/tasks', query: \{ taskId: r\?\.taskId \} \}\); \} \},\s*\}\);/);
    expect(strip(io), '纯文本指引退役（与 action 去重；注释字面不算数）').not.toContain('去任务页看进度');
  });
});

/* ═══════════ ③ FavoritesView 人话文案 + ConfigDrift 失败计数 ═══════════ */

describe('561③：FavoritesView 导入失败人话化 + ConfigDrift scanAllVerdicts 失败计数', () => {
  it('FavoritesView：两处导入失败裸串换人话（原始 message 括注保真）', () => {
    expect(fav, '收藏导入：不是合法的收藏 JSON 文件').toContain("store.notify('error', '不是合法的收藏 JSON 文件（原始错误：' + err.message + '）');");
    expect(fav, '偏好导入：文件无法读取，请重试').toContain("store.notify('error', '文件无法读取，请重试（原始错误：' + err.message + '）');");
    expect(fav, '裸串拼接退役').not.toContain("'导入失败：' + err.message");
  });
  it('ConfigDriftView：失败数+键名统计（静默 catch 退役；失败键 verdict 不写三态）', () => {
    expect(cd).toMatch(/const failedKeys: string\[\] = \[\];/);
    expect(cd, '失败键名入册').toMatch(/failedKeys\.push\(String\(k\.indexKey\)\);/);
    expect(cd, '失败键 verdict 不强行改三态（消费方分支不动）').not.toMatch(/catch \{[^}]*verdicts\.value/);
  });
  it('ConfigDriftView：M>0 换 warn 档「N 成功 / M 失败(首 3 键…)」，全成功仍走 success 原文案', () => {
    expect(cd).toMatch(/store\.notify\('warning', `检测完成：\$\{n\} 成功 \/ \$\{failedKeys\.length\} 失败（首 3 键：\$\{failedKeys\.slice\(0, 3\)\.join\('、'\)\}）`\);/);
    expect(cd).toContain("store.notify('success', `已检测 ${keys.value.length} 个索引的漂移状态`)");
  });
});

/* ═══════════ ④ --danger deprecated 别名退役（面） ═══════════ */

describe('561④：--danger 消费退役——四文件 var(--danger) 清零', () => {
  it('七处消费换 var(--err)：ConfigDrift/BulkEditor/PainlessLab/Workspace 源文本不含 var(--danger)', () => {
    for (const [n, s] of [['ConfigDriftView', cd], ['BulkEditorView', be], ['PainlessLabView', pl], ['WorkspaceView', ws]] as const) {
      expect(s.includes('var(--danger)'), n + ' 不再消费 var(--danger)').toBe(false);
    }
  });
  it('theme.css 定义行保留（--danger: var(--err) 别名在他人工蚁/禁合并面退役前仍需存在）', () => {
    expect(theme).toMatch(/--danger: var\(--err\);/);
  });
});

/* ═══════════ ⑤ export-name 七表补名（527 契约纯属性增量） ═══════════ */

describe('561⑤：export-name 补名（导出文件名语义化；命名不与已锁名重复）', () => {
  const NAMES: Array<[string, string, string]> = [
    ['BrowserView', bw, 'browser-docs'],
    ['AnalyzeView', av, 'analyze-tokens'],
    ['SystemView', sy, 'system-index'],
    ['PluginsView', pv, 'plugins-raw'],
    ['HealthReportView(unhealthy)', hr, 'health-ux'],
    ['HealthReportView(nodes)', hr, 'health-nd'],
    ['SearchTemplatesView', st, 'tpl-result'],
  ];
  const LOCKED = ['reconcile-report', 'match-matrix', 'diag-ops', 'sec-audit', 'profile-flame', 'xm-jobs', 'adhoc-jobs', 'cd-verdict', 'queryxray', 'cluster-settings', 'dq-results', 'ih-docs', 'ih-qry', 'pit-preview', 'tpl-hits'];
  for (const [n, s, name] of NAMES) {
    it(`${n}：export-name="${name}"`, () => {
      expect(s).toContain(`export-name="${name}"`);
    });
  }
  it('命名不与已锁名撞车（tableKernelWave532 等存量单源）', () => {
    for (const [, , name] of NAMES) expect(LOCKED.includes(name), name + ' 撞已锁名').toBe(false);
  });
});
