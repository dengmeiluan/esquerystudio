/**
 * 五百五十七批（工蚁3）：轨2 四大重点页 · 556 设计稿实施批。
 * 设计稿：docs/GOAL-534-TRACK2-556.md；回执：docs/GOAL-534-TRACK2-557.md。实施序 IH→DT→DQ→AR：
 * ① IH 摘 card 壳（抽屉浮层脱卡，theme.css .card 依赖随之消失）+ query tab 失败态 .ih-qerr
 *   私造红壳合并全局 err-bar（role=alert + 重试钮 + errPreHtml/errMeta 双参 + qryErrRaw
 *   原始对象旁路，DslQueryView :269 554 先例）+ docs tab err-bar 裸插值升级
 *   errPreHtml（docsErrRaw，XmigrateView :63 先例）+ esError 人话化 ×4（保存/删除/修改/删除，
 *   XmigrateView w80 先例）；
 * ② DT Ctrl+I 格式化请求体（对齐 Kibana Console 键位表 Auto-indent：getEditor() expose 出口 addCommand，
 *   MonacoEditor 组件本体零改——全站黑名单）+ run() 前置 tryFormat（合法 JSON 才 pretty，
 *   非法/带注释不动——严格 JSON.parse 门，stripJsonComments 宽容口径留给手动 format 钮 :789-793）
 *   + 响应搜索框 min(150px,100%) 极窄钳制；
 * ③ DQ .dq-res-body padding 退役（--dq-view-cap:56vh 与 flex 链逐字保留；queryWorkbenchW1:108
 *   正则锁同步更新，workbenchParity402 cap 锚免同步更新）+ 手写「·」元信息串 ×2（执行行 A/B 增量
 *   chip / 直方图节头 meta）合并 MetaStrip dot/text 统一件——workbenchParity402:28/:30
 *   span 字面锁保形：外层 span 保留，合并发生在其内（runDelta.txt 锚随形）；
 * ④ AR pi-hint 粘贴导入弹窗内 bg2 小卡降行内弱文（卡中卡根治，.ih-tip 同语言）+
 *   ar-jobs-kw min(240px,100%) 断点钳（547 XmigrateView:1291 先例同款）。
 * HotkeyPanel 登记 Ctrl+I（hotkeyParityGuard293 只钉 >15 行 + 无重复，新增唯一行合规）。
 * 全部为源码锁（readFileSync），挂载行为网由既有 spec 承担（indexHubExec534 等）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const ar = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');
const hk = readFileSync(join(__dirname, '../components/HotkeyPanel.vue'), 'utf-8');
const me = readFileSync(join(__dirname, '../components/MonacoEditor.vue'), 'utf-8');
/* 五百五十八批同步更新：直方图节壳改用 HistogramSection，节头 meta 合并锁同步更新组件源 */
const hist = readFileSync(join(__dirname, '../components/HistogramSection.vue'), 'utf-8');

/* ═══════════ 一、IH：摘 card 壳 + 失败态合并 err-bar + esError ×4 ═══════════ */
describe('557 一：IH 抽屉摘 card 壳 + 失败态合并 err-bar（556 设计稿实施）', () => {
  it('抽屉模板摘 card：class="ih-left ih-drawer"（.ih-left/.ih-drawer 声明零改，遮罩+投影承担层级）', () => {
    expect(ih).toContain('class="ih-left ih-drawer"');
    expect(ih, 'card 壳不回流').not.toMatch(/ih-left card/);
  });

  it('query tab 失败态合并全局 err-bar：role=alert + errPreHtml/errMeta 双参 + 重试钮（v-if 链同条件保形）', () => {
    expect(ih).toContain('<div v-if="qryErr" role="alert" class="err-bar ih-qerr">');
    expect(ih).toContain('<pre class="mono" v-html="errPreHtml(qryErr, errMeta(qryErrRaw))"></pre>');
    const barAt = ih.indexOf('class="err-bar ih-qerr"');
    const barEnd = ih.indexOf('</div>', barAt);
    const bar = ih.slice(barAt, barEnd);
    expect(bar, '失败条内重试钮（busy 中禁用防重入）').toContain(':disabled="qryLoading"');
    expect(bar, '重试走 runDsl 既有 JSON 合法性门').toContain('@click="runDsl()"');
    /* RT v-else-if="qryResp" 链位紧随其后（indexHubExec534 toBeNull 负断言的 v-if 语义不变） */
    expect(ih.slice(barAt, barAt + 600)).toContain('v-else-if="qryResp"');
  });

  it('私造红壳样式退役：border/err-soft/radius 不回流（语义边框归 theme.css .err-bar 单源），只留落位+pre 排版', () => {
    expect(ih, 'border 不回流').not.toMatch(/\.ih-qerr \{[^}]*border/);
    expect(ih, 'err-soft 底不回流').not.toMatch(/\.ih-qerr \{[^}]*err-soft/);
    expect(ih, 'radius 不回流').not.toMatch(/\.ih-qerr \{[^}]*border-radius/);
    expect(ih, 'pre 排版（弹性让宽+钳制）在场').toMatch(/\.ih-qerr pre, \.ih-docs-err pre \{/);
  });

  it('qryErrRaw 原始对象旁路（DslQueryView queryErrRaw 同款：errPre import + catch 旁路 + 声明）', () => {
    expect(ih).toMatch(/import \{ errPreHtml, errMeta \} from '\.\.\/utils\/errPre';/);
    expect(ih).toMatch(/const qryErrRaw = ref<unknown>\(null\);/);
    expect(ih).toContain('qryErrRaw.value = e;');
    expect(ih).toContain('qryErrRaw.value = null;');
  });

  it('docs tab err-bar 裸插值 → errPreHtml+errMeta 双参（docsErrRaw 旁路；XmigrateView :63 先例）', () => {
    expect(ih).toContain('<pre class="mono" v-html="errPreHtml(docsErr, errMeta(docsErrRaw))"></pre>');
    expect(ih).toMatch(/const docsErrRaw = ref<unknown>\(null\);/);
    expect(ih).toContain('docsErrRaw.value = e;');
    expect(ih).toContain('docsErrRaw.value = null;');
  });

  it('esError 人话化 ×4：保存/删除/修改/删除 裸 e.message 拼串退役（XmigrateView w80 先例）', () => {
    expect(ih).toContain("store.notify('error', '保存失败: ' + friendlyEsError(String(e?.message ?? e)));");
    expect(ih.match(/删除失败: ' \+ friendlyEsError\(String\(e\?\.message \?\? e\)\)/g)!.length, '删除失败 ×2（单条+批量入口）').toBe(2);
    expect(ih).toContain("store.notify('error', '修改失败: ' + friendlyEsError(String(e?.message ?? e)));");
    const bare = ih.match(/\+ \(e\?\.message \|\| e\)/g) ?? [];
    expect(bare.length, '裸拼串仅剩 opRaw 一处（ ×4 域外不动）').toBe(1);
  });
});

/* ═══════════ 二、DT：Ctrl+I 格式化请求体 + run() 前置 tryFormat + 断点钳 ═══════════ */
describe('557 二：DT Ctrl+I 宿主接线 + run() 前置 auto-format（Kibana 对标）', () => {
  it('Ctrl+I 经 getEditor() expose 出口 addCommand（KeyMod.CtrlCmd|KeyCode.KeyI → triggerSuggest），MonacoEditor 本体零改', () => {
    expect(dt).toContain("import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';");
    expect(dt).toContain('monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI');
    /* 1129：Ctrl+I 改绑「格式化请求体」（对齐 Kibana 官方键位表 Ctrl+I=Auto-indent；
       补全交回 Monaco 默认 Ctrl+Space）。仍走 getEditor() expose 出口、MonacoEditor 本体零改 */
    expect(dt).toContain('dt-auto-indent');
    expect(dt).toContain('tryFormatBody(');
    expect(dt).toContain('KeyMod.CtrlCmd | monaco.KeyCode.KeyI');
    expect(me, '组件黑名单零触：KeyI 不进 MonacoEditor 本体').not.toContain('KeyCode.KeyI');
    expect(me, '组件黑名单零触：格式化命令不进 MonacoEditor 本体').not.toContain('dt-auto-indent');
  });

  it('挂载时序防 undefined：watch(bodyMonacoRef)+nextTick 后置取（editor 在子组件 onMounted 创建）+ addCommand 可用性守卫', () => {
    expect(dt).toMatch(/watch\(bodyMonacoRef/);
    expect(dt).toMatch(/typeof ed\.addCommand !== 'function'/);
  });

  it('run() 前置 tryFormat：busy 快照后、api.raw 前（合法 JSON 才 pretty；严格 JSON.parse 门=非法/带注释不动；草稿零触）', () => {
    const runBody = dt.slice(dt.indexOf('async function run()'), dt.indexOf('/* 语义色轮：耗时展示与四档'));
    const busyAt = runBody.indexOf('t.busy = true');
    /* 五百六十批同步更新：dt.autoFmt 退出口（条件分支；busy 快照后、api.raw 前的位置语义不变） */
    const fmtAt = runBody.indexOf('const bodyOut = autoFmt.value ? tryFormatBody(t.body) : t.body;');
    const rawAt = runBody.indexOf('api.devtoolsExecute(');
    expect(busyAt, 'busy 快照在场（防空跑）').toBeGreaterThan(-1);
    expect(fmtAt, 'tryFormat 调用在场').toBeGreaterThan(-1);
    expect(rawAt, 'api.devtoolsExecute 在场（防空跑）').toBeGreaterThan(-1);
    expect(fmtAt, 'tryFormat 在 busy 快照之后').toBeGreaterThan(busyAt);
    expect(fmtAt, 'tryFormat 在 api.devtoolsExecute 之前（send 前置）').toBeLessThan(rawAt);
    /* 1126：发送值多了一层 ${var} 展开（bodyFinal），但「送格式化出参、草稿零触」的契约不变——
       断言 bodyFinal 由 bodyOut 派生，且草稿 t.body 仍原样进历史/镜像 */
    expect(runBody, '送格式化出参进 api.raw（t.body 草稿零触：历史/镜像源码锁 body: t.body + fill 回填保形）').toContain('api.devtoolsExecute(t.method, pathOut, bodyFinal, signal)');
    expect(runBody, 'bodyFinal 由格式化出参派生（变量展开不绕过 autoFmt）').toContain('applyVars(bodyOut)');
    expect(dt).toContain('function tryFormatBody(body: string): string');
    expect(dt).toContain('try { return JSON.stringify(JSON.parse(body), null, 2); } catch');
  });

  it('响应搜索框极窄钳制：width: min(150px, 100%)（547 XmigrateView:1291 先例同款）', () => {
    /* 1126：加入「过滤响应」档后工具行更挤——宽度钳制保留，并加 min-width 下限保护
       （搜索是高频动作，压缩预算优先让给可选的过滤表达式） */
    expect(dt).toMatch(/\.dt-resp-search input \{ width: min\(150px, 100%\); min-width: 96px; padding:/);
  });
});

/* ═══════════ 三、HotkeyPanel：Ctrl+I 登记 ═══════════ */
describe('557 三：HotkeyPanel 登记 Ctrl+I（hotkeyParityGuard293 合规：>15 行+无重复）', () => {
  it('查询与编辑组新增唯一 Ctrl+I 行（DevTools 补全唤起，Ctrl+Space 同效语义写实）', () => {
    expect(hk).toMatch(/\{ keys: \['Ctrl', 'I'\], desc: '格式化当前请求体（DevTools；草稿同步，等价手改）', pageKeys: \['devtools'\] \}/);
  });
});

/* ═══════════ 四、DQ：padding 退役 + meta ×2 合并 MetaStrip ═══════════ */
describe('557 四：DQ .dq-res-body padding 退役 + 手写「·」元信息串 ×2 合并 MetaStrip', () => {
  it('padding 退役：--dq-view-cap: 56vh 与 flex 链逐字保留（queryWorkbenchW1:108 正则锁同步更新；402 cap 锚免同步更新）', () => {
    expect(dq).toContain('.dq-res-body { --dq-view-cap: 56vh; flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }');
    expect(dq, 'padding 不回流').not.toMatch(/\.dq-res-body \{ padding:/);
  });

  it('执行行 A/B 增量合并 MetaStrip：dot（faster/slower→ok/warn 冗余色标）+text（Δ 串）形态；外层 span 字面保形', () => {
    expect(dq).toMatch(/import MetaStrip from '\.\.\/components\/MetaStrip\.vue';/);
    expect(dq, 'workbenchParity402:28 锁面保形').toContain('<span v-if="resp && runDelta" class="dq-meta mono">');
    expect(dq).toMatch(/<MetaStrip class="dq-delta-ms" :items="\[\{ dot: runDelta\.cls === 'faster' \? 'var\(--ok\)' : runDelta\.cls === 'slower' \? 'var\(--warn\)' : undefined, text: runDelta\.txt, tip: runDelta\.tip \}\]" \/>/);
    expect(dq, 'workbenchParity402:30 锚保形').toMatch(/runDelta\.txt/);
  });

  it('直方图节头 meta 合并 MetaStrip：text 段形态（ms-sep 承担分隔），histHeadMeta 字面在改用链保形（558 同步更新：合并形态归一组件源）', () => {
    expect(hist).toContain('<MetaStrip class="dq-sec-meta" :items="brushRange ? [{ text: meta }, { text: \'已刷选 \' + brushRange }] : [{ text: meta }]" />');
    expect(hist, '组件侧手写「· 已刷选」分隔退役（ms-sep 承担）').not.toContain('· 已刷选');
    /* dqHistHead549/dqUx553 切片锚同步更新：DQ 侧 histHeadMeta 经 meta prop 直喂组件（549/553 锚保形） */
    expect(dq).toContain(':meta="histHeadMeta"');
    expect(dq, '页内联节壳退役（558 改用 HistogramSection）').not.toContain('class="dq-hist-sec"');
    expect(dq, '手写「· 已刷选」分隔退役（组件 ms-sep 承担）').not.toContain('· 已刷选');
    expect(hist, '.dq-hist-head .dq-sec-meta CSS 锚（dqFix552:111）随改用归一组件源').toMatch(/\.dq-hist-head \.dq-sec-meta \{ overflow: hidden; text-overflow: ellipsis/);
  });

  it('.dq-delta 手写 chip 三条规则随合并退役（无 spec 锚，grep 实证）', () => {
    expect(dq).not.toMatch(/\.dq-delta \{/);
    expect(dq).not.toMatch(/\.dq-delta\.faster/);
    expect(dq).not.toMatch(/\.dq-delta\.slower/);
  });
});

/* ═══════════ 五、AR：pi-hint 降级 + 断点钳 ═══════════ */
describe('557 五：AR pi-hint 弹窗内小卡降级 + ar-jobs-kw 断点钳', () => {
  it('pi-hint 降行内弱文：bg2 底+radius 退役，fs-xs/tx2 弱文语言保留（.ih-tip 同语言；模板元素与引导文案零触）', () => {
    expect(ar).toContain('.pi-hint { font-size: var(--fs-xs); color: var(--tx2); line-height: 1.5; margin-bottom: var(--sp-2); }');
    expect(ar, 'bg2 小卡底不回流').not.toMatch(/\.pi-hint \{[^}]*background/);
    expect(ar, 'radius 不回流').not.toMatch(/\.pi-hint \{[^}]*border-radius/);
    expect(ar, '模板壳与引导文案在位').toContain('<div class="pi-hint">');
    expect(ar).toContain('支持识别：Mapping 页「原始 JSON」复制的完整配置');
  });

  it('ar-jobs-kw 极窄钳制：width: min(240px, 100%)（547 XmigrateView:1291 先例同款；900 档 100% 独占行不变）', () => {
    expect(ar).toMatch(/\.ar-jobs-kw \{ width: min\(240px, 100%\); \}/);
  });
});
