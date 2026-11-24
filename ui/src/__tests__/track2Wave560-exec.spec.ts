/**
 * 五百六十批（工蚁C）：轨2 执行体验深化 —— 源码锁（track2Wave557 范式）。
 *
 * ① DevToolsView 全局执行：onGlobalRunKey 挂 window keydown（DslQueryView :2041-2048 先例平移，
 *    INPUT/TEXTAREA/SELECT/contentEditable/.monaco-editor 让路 + 执行中让路）；onMounted 注册/
 *    onBeforeUnmount 摘除（现成对）。
 * ② DevToolsView 编辑器字号三档：usePref('dt.font', 12.5) + 请求体/响应 Monaco :font-size="edFont"
 *    （MonacoEditor fontSize prop 既有，黑名单零触）+ seg 三档（12.5/14/16）落请求工具行。
 * ③ DevToolsView 发送态 auto-format 退出口：usePref('dt.autoFmt', true) + 条件 format 分支
 *    （只动发送出参 bodyOut；历史/镜像 body:t.body 原稿锁面零触）。
 * ④ DevToolsView 「复制请求体」钮（请求工具行，成功文案对齐 RawIoModal「请求体已复制」）。
 * ⑤ AdhocRebuildView：报告节头「复制回补 DSL」/ 时间字段候选可点 chip / 目标索引「用建议名」。
 * ⑥ AdhocRebuildView：JsonArea .ja 外框视图侧退壳（.ed-col 四框 + 弹窗 .pi-ja-wrap，557 先例）。
 * ⑦ AdhocRebuildView：blockTimer visibilitychange 守卫（hidden 不空转，jobTracker onVisChange 范式）。
 * ⑧ XmigrateView：.xm-group grid-column 全宽纵排（.xm-cfg-grid 双列保留；独立规则追加锁面零触）；
 *    启动行读秒（AdhocRebuildView :433 范式，SqlBridge starting 布尔与 qr 并存互斥口径）。
 * ⑨ ar-jobs-kw / xm-jobs-kw 改用 SearchFilterBar（559 TasksView tv-kw 先例；placeholder 逐字保留，
 *    kw 类锚随 input-class 留在 input 上——524/529 挂载过滤锁同路径零迁）。
 * ⑩ HotkeyPanel「查询与编辑」组加两行（DevTools 全局执行任意焦点 / IH query 编辑器补全）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const dt = read('../views/DevToolsView.vue');
const ar = read('../views/AdhocRebuildView.vue');
const xm = read('../views/XmigrateView.vue');
const hk = read('../components/HotkeyPanel.vue');

/* ═══ 一、DevToolsView 全局执行键 ═══ */
describe('560 ①：DevToolsView 全局执行（DslQueryView onGlobalRunKey 先例平移）', () => {
  const mountedBody = dt.slice(dt.indexOf('onMounted(() => {'), dt.indexOf('onBeforeUnmount(() => {'));
  const unmountBody = dt.slice(dt.indexOf('onBeforeUnmount(() => {'));

  it('onGlobalRunKey 在场：Ctrl/Cmd+Enter 门 + 五类让路清单 + 执行中让路', () => {
    expect(dt).toContain('function onGlobalRunKey(e: KeyboardEvent) {');
    const fn = dt.slice(dt.indexOf('function onGlobalRunKey(e: KeyboardEvent) {'),
      dt.indexOf('}', dt.indexOf('function onGlobalRunKey(e: KeyboardEvent) {') + 2000));
    expect(fn).toContain("if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;");
    expect(fn).toContain("t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.closest('.monaco-editor')");
    expect(fn, '执行中让路（防并发重入）').toContain('cur.value.busy');
    expect(fn).toContain('e.preventDefault();');
    expect(fn).toContain('run();');
  });

  it('onMounted 注册 / onBeforeUnmount 摘除（window keydown 现成对）', () => {
    expect(mountedBody).toContain("window.addEventListener('keydown', onGlobalRunKey);");
    expect(unmountBody).toContain("window.removeEventListener('keydown', onGlobalRunKey);");
  });
});

/* ═══ 二、DevToolsView 编辑器字号档 ═══ */
describe('560 ②：DevToolsView 编辑器字号三档（dt.font，MonacoEditor 零触纯宿主传参）', () => {
  const reqPane = dt.slice(dt.indexOf('#pane-devtools-search-request'), dt.indexOf('#pane-devtools-search-response'));

  it("usePref('dt.font', 12.5) + 三档常量单源消费（668 同步更新：editorTiers 合并）+ seg 消费", () => {
    expect(dt).toContain("usePref<number>('dt.font', 12.5)");
    /* 六百六十八批同步更新：本地 ED_FONT_TIERS 字面退役→共享 EDITOR_FONT_TIERS 消费
       （DQ dq.font/IH ih.font 同口径；本体锚迁移至 edFontSpread668.spec B 段） */
    expect(dt).toContain('v-for="f in EDITOR_FONT_TIERS"');
    expect(reqPane).toContain('edFont === f');
  });

  it('请求体 Monaco 与响应只读面同键 :font-size="edFont"（高度链字面零触）', () => {
    expect(reqPane).toContain(':font-size="edFont"');
    expect(dt).toMatch(/:dsl-assist="dtRespAssist"[\s\S]{0,220}?:font-size="edFont"/);
  });
});

/* ═══ 三、DevToolsView 发送态 auto-format 退出口 ═══ */
describe('560 ③：DevToolsView dt.autoFmt 退出口（条件 format 分支，草稿/历史原稿锁面零触）', () => {
  it("usePref('dt.autoFmt', true) + run() 条件出参（busy 快照后、api.raw 前位置语义不变）", () => {
    expect(dt).toContain("usePref('dt.autoFmt', true)");
    const runBody = dt.slice(dt.indexOf('async function run()'), dt.indexOf('/* 语义色轮：耗时展示与四档'));
    const busyAt = runBody.indexOf('t.busy = true');
    const fmtAt = runBody.indexOf('const bodyOut = autoFmt.value ? tryFormatBody(t.body) : t.body;');
    const rawAt = runBody.indexOf('api.devtoolsExecute(');
    expect(fmtAt, '条件 format 分支在场').toBeGreaterThan(-1);
    expect(fmtAt).toBeGreaterThan(busyAt);
    expect(fmtAt).toBeLessThan(rawAt);
    /* 1127：发送值多了一层 ${var} 展开，但「run() 用格式化出参、草稿 t.body 零触」的锁面不变 */
    expect(runBody).toContain('api.devtoolsExecute(t.method, pathOut, bodyFinal, signal)');
    expect(runBody).toContain('applyVars(bodyOut)');
  });

  it('开关钮居请求 pane ⋯ 菜单（menuitemcheckbox aria-checked 态 + 落盘键接线，577 批同步更新 563 合并形态）', () => {
    const reqPane = dt.slice(dt.indexOf('#pane-devtools-search-request'), dt.indexOf('#pane-devtools-search-response'));
    expect(reqPane).toContain('@click="autoFmt = !autoFmt"');
    /* 五百七十七批同步更新：563 批开关收 ⋯ 菜单改用 menuitemcheckbox——aria-pressed → :aria-checked 态锚 */
    expect(reqPane).toContain('menuitemcheckbox');
    expect(reqPane).toContain(':aria-checked="autoFmt');
  });
});

/* ═══ 四、DevToolsView 复制请求体钮 ═══ */
describe('560 ④：DevToolsView 请求 pane「复制请求体」钮（copyText(cur.body)）', () => {
  it('请求工具行钮在场（aria + 接线），成功文案对齐 RawIoModal「请求体已复制」', () => {
    const reqPane = dt.slice(dt.indexOf('#pane-devtools-search-request'), dt.indexOf('#pane-devtools-search-response'));
    expect(reqPane).toContain('aria-label="复制请求体"');
    expect(dt).toContain('copyText(cur.value.body)');
    expect(dt).toContain("'请求体已复制'");
  });
});

/* ═══ 五、AdhocRebuildView 三钮 ═══ */
describe('560 ⑤：AdhocRebuildView 复制回补 DSL / 时间字段 chip / 用建议名', () => {
  it('收尾报告节头「复制回补 DSL」ghost xs → copyBackfillDsl（RawIoModal copyReq 三行手法）', () => {
    const reportSec = ar.slice(ar.indexOf('收尾报告'), ar.indexOf('</div>', ar.indexOf('收尾报告') + 200));
    expect(reportSec).toContain('复制回补 DSL');
    expect(reportSec).toContain('@click="copyBackfillDsl"');
    const fn = ar.slice(ar.indexOf('async function copyBackfillDsl()'));
    expect(fn).toContain('copyText(');
    expect(fn).toContain('suggestedBackfillDsl');
    expect(fn).toMatch(/ok \? 'success' : 'error'/);
  });

  it('时间字段候选改可点 chip（@click 预选 timeField + title 引导）', () => {
    expect(ar).toContain('@click="timeField = c.field"');
    expect(ar).toContain('点击预选为追平时间字段');
    expect(ar, 'chip 挂选中态').toMatch(/:class="\{ on: timeField === c\.field \}"/);
  });

  it('目标索引行尾「用建议名」ghost xs → destIndex = prep.suggestedDest（destNameErr 链零触）', () => {
    expect(ar).toContain('@click="destIndex = prep.suggestedDest"');
    expect(ar).toContain('用建议名');
    expect(ar).toContain('@keydown.enter="destIndexEnter"');
    expect(ar).toContain("if (!validating.value) void doValidateConfig(true);");
  });
});

/* ═══ 六、AdhocRebuildView JsonArea .ja 外框退壳 ═══ */
describe('560 ⑥：AdhocRebuildView JsonArea .ja 外框视图侧退壳（557 先例，组件零触）', () => {
  it('.ed-col 四框 + 弹窗 .pi-ja-wrap 两独立 :deep 规则（border/box-shadow none）', () => {
    expect(ar).toContain('.ed-col :deep(.ja) { border: none; border-radius: 0; box-shadow: none; }');
    expect(ar).toContain('.pi-ja-wrap :deep(.ja) { border: none; border-radius: 0; box-shadow: none; }');
  });
});

/* ═══ 七、AdhocRebuildView blockTimer visibilitychange 守卫 ═══ */
describe('560 ⑦：AdhocRebuildView blockTimer 页面隐藏不空转（jobTracker onVisChange 范式）', () => {
  it('visibilitychange 监听注册 + hidden 停表 / 回看横幅条件重启 + 卸载摘除', () => {
    expect(ar).toContain("document.addEventListener('visibilitychange', onBlockVisChange);");
    const fn = ar.slice(ar.indexOf('function onBlockVisChange()'),
      ar.indexOf('}', ar.indexOf('function onBlockVisChange()') + 400));
    expect(fn).toContain('if (document.hidden)');
    expect(fn).toContain('stopBlockTicker()');
    expect(fn).toContain("job.value?.stage === 'AWAIT_CONFIRM'");
    expect(fn).toContain('startBlockTicker()');
    const unmountBody = ar.slice(ar.indexOf('onBeforeUnmount(() => { stopPolling(); stopBlockTicker();'));
    expect(unmountBody).toContain("document.removeEventListener('visibilitychange', onBlockVisChange);");
  });
});

/* ═══ 八、XmigrateView xm-group 全宽 + 启动读秒 ═══ */
describe('560 ⑧：XmigrateView 三步向导全宽纵排 + 启动行读秒', () => {
  it('.xm-group grid-column 全宽（独立规则追加，531/534 锁面字面零触；.xm-cfg-grid 双列保留）', () => {
    expect(xm).toContain('.xm-group { grid-column: 1 / -1; }');
    expect(xm).toContain('.xm-group { margin-bottom: 0; padding: var(--sp-2) 0 0; border: 0; border-top: 1px solid var(--line); border-radius: 0; }');
    expect(xm).toContain('.xm-cfg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); margin-top: var(--sp-3); }');
  });

  it('启动行读秒：AdhocRebuildView :433 范式（starting ? 启动中 X.Xs）+ useQueryRun 接线', () => {
    expect(xm).toMatch(/starting \? '启动中 ' \+ startSecs \+ 's' : '启动迁移'/);
    expect(xm).toMatch(/import \{ useQueryRun \} from '\.\.\/composables\/useQueryRun';/);
    expect(xm).toMatch(/const startSecs = computed\(\(\) => \(qr\.elapsedMs\.value \/ 1000\)\.toFixed\(1\)\);/);
    /* starting 闸收 openStartConfirm 本体（置位前移到确认窗之前）——内层旧双查
    （starting.value || qr.running.value）随前移退役（保留会短路死），互斥口径升格
    不退役：闸读/置位前移锁在确认链执行体，doStart 保留 qr 运行态防御查 */
    const gateBody = xm.slice(xm.indexOf('async function openStartConfirm()'), xm.indexOf('async function doStart()'));
    expect(gateBody, '启动闸收确认链本体首行').toContain('if (starting.value) return;');
    expect(gateBody.indexOf('starting.value = true;'), '置位先于第一个 await')
      .toBeLessThan(gateBody.indexOf('api.xb.preflight'));
    const startBody = xm.slice(xm.indexOf('async function doStart()'), xm.indexOf('/* 作业列表 */'));
    expect(startBody).toContain('if (qr.running.value) return;');
    expect(startBody, '内层旧双查随闸前移退役').not.toContain('starting.value = true;');
    expect(startBody).toContain('qr.begin();');
    expect(startBody).toContain('qr.finish();');
  });
});

/* ═══ 九、ar-jobs-kw / xm-jobs-kw 改用 SearchFilterBar ═══ */
describe('560 ⑨：ar-jobs-kw / xm-jobs-kw 改用 SearchFilterBar 统一件（559 tv-kw 先例）', () => {
  it('AR：SFB 接线 + placeholder 逐字保留 + kw 类锚随 input-class 留在 input', () => {
    expect(ar).toMatch(/import SearchFilterBar from '\.\.\/components\/SearchFilterBar\.vue';/);
    expect(ar).toContain('input-class="ar-jobs-kw"');
    expect(ar).toContain('placeholder="过滤：jobId / 逻辑名 / 状态"');
    expect(ar).toMatch(/<SearchFilterBar v-model="jobKw"/);
  });

  it('Xm：SFB 接线 + placeholder 逐字保留 + cardShellWave547 DOM 锚字面（input-class="inp xm-jobs-kw"）', () => {
    expect(xm).toMatch(/import SearchFilterBar from '\.\.\/components\/SearchFilterBar\.vue';/);
    expect(xm).toContain('input-class="inp xm-jobs-kw"');
    expect(xm).toContain('placeholder="过滤：状态 / 目标索引 / 源索引"');
    expect(xm).toMatch(/<SearchFilterBar v-model="jobKw"/);
  });

  it('落位宽度随改用迁 wrap 根（min(240px,100%) + 900 档 100% 独占行）', () => {
    expect(ar).toContain('.ar-jobs-kw-wrap { width: min(240px, 100%); box-sizing: border-box; }');
    expect(xm).toContain('.xm-jobs-kw-wrap { width: min(240px, 100%); box-sizing: border-box; }');
    const arBlock = ar.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);
    expect(arBlock![0]).toContain('.ar-jobs-kw-wrap { width: 100%; }');
    const xmBlock = xm.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);
    expect(xmBlock![0]).toContain('.xm-jobs-kw-wrap { width: 100%; }');
  });
});

/* ═══ 十、HotkeyPanel 两行登记 ═══ */
describe('560 ⑩：HotkeyPanel「查询与编辑」组加两行（固定文案）', () => {
  it('Ctrl+Enter DevTools 全局执行（任意焦点）行在场', () => {
    expect(hk).toContain("{ keys: ['Ctrl', 'Enter'], desc: 'DevTools 全局执行请求（任意焦点；输入控件 / 编辑器内让路）', pageKeys: ['devtools'] },");
  });
  it('Ctrl+I 索引工作区 query 编辑器补全行在场（557 既有 Ctrl+I 行零触）', () => {
    expect(hk).toContain("{ keys: ['Ctrl', 'I'], desc: '索引工作区 query 编辑器补全', pageKeys: ['indices'] },");
    /* 1129：Ctrl+I 改绑格式化（对齐 Kibana Auto-indent），本行文案同步 */
    expect(hk).toContain("{ keys: ['Ctrl', 'I'], desc: '格式化当前请求体（DevTools；草稿同步，等价手改）', pageKeys: ['devtools'] }");
  });
});
