/**
 * 五百五十三批 W1：查询工作台用户真机八点之交互七点（源码静态锁定，readFileSync 形态同族
 * dqHeightUnify549/dqFix552）。
 * A)（图1+图7）「顶栏 seg 按了之后一侧就不显示，无法还原」实勘：独占隐藏侧=0 宽+整栏无柄
 *    （538 压 0+549 约定）=物理不可见，还原只剩工具行 seg 一个远端入口。修：
 *    ①seg toggle 语义（激活档再点=还原对半，分段控件通用心智+激活态 title 明示）；
 *    ②WorkbenchLayout 独占隐藏侧原位渲染「还原对半」竖轨（点击 setMaximize(null)），
 *      542「独占↔竖轨」约定补完；穷举 seg 三态×构建区收起×执行的矩阵由竖轨+seg 双通道兜底。
 * B)（图2）「往下拉表格反而大了」根因实证=结果柄方向反转：SplitHandle 增量=柄自身坐标基线+Δ，
 *    而结果柄在结果区上方——边界应随指针（VS Code 面板惯例），向下拖=顶缘下移=高度应减；
 *    组件黑名单不可改，宿主侧 pointerdown/focus 快照反向换算（552 clamp 320..视口-260 保留）。
 *    「默认就应该是这样高度才对人」裁决=buildCollapsed 缺省 true（构建区默认收起=表格默认大，
 *    行为变更备案：展开入口=工具行「查询构建与编辑」节头钮+表格头「还原」钮双入口常驻）。
 * C)（图3）直方图开关四迁：节头→执行行右组 Profile 旁（同款 .dq-sw 激活胶囊；约定史备案：
 *    542 执行行→547 表格工具行→549 节头→553 执行行 Profile 旁=用户终审）；柱状图本体/
 *    节头标题/meta/清除刷选留原位。
 * D)（图4）「看不到 profile」根因=Profile 树藏在 paramsOpen 缺省 false 的参数面板内——
 *    移出成 run-sec 独立块，只受 profileTree 数据门控（queryFlat534 字面锁保形）。
 * E)（图5）「日常场景应该跟查询构建器位置换一下」：构建节头先行，场景下拉（toolbar-prepend
 *    slot）随其后（542 三行合一顺序锁同步更新修订）。
 * F)（图6）「检索参数/应用太廉价不美观无质感」：检索参数 tg 无框档→细描边胶囊+icon+激活柔底
 *    （track2Wave551 无框形修订备案）；应用钮 ghost→描边实底次级钮+icon（与「执行」主钮
 *    主次层级；dqFix552 三件全 ghost 修订备案）；--ctl-h 三锁零触。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const wl = readFileSync(join(__dirname, '../components/WorkbenchLayout.vue'), 'utf-8');
/* 五百五十八批同步更新：直方图节壳改用 HistogramSection，C 组节头内容锁同步更新组件源 */
const hist = readFileSync(join(__dirname, '../components/HistogramSection.vue'), 'utf-8');

describe('A①：seg toggle 还原语义（553 批，激活档再点=还原对半）', () => {
  it('setSplitTier 激活档再点走 setMaximize(null)（toggle 二态）', () => {
    const fnAt = dq.indexOf('function setSplitTier');
    const fn = dq.slice(fnAt, fnAt + 500);
    expect(fn, '激活档判定在场').toMatch(/splitTier\.value === tier/);
    expect(fn, 'toggle 回对半').toMatch(/setMaximize\(null\)/);
  });
  it('激活态 title 明示再点还原（独占态可达性：入口自带说明）', () => {
    expect(dq).toContain("splitTier === 'tree' ? '条件树独占中——再点还原对半分栏'");
    expect(dq).toContain("splitTier === 'ws' ? '编辑器独占中——再点还原对半分栏'");
  });
});

describe('A②：WorkbenchLayout 独占态还原竖轨（553 批，隐藏侧原位还原入口）', () => {
  it('还原竖轨按钮在场：仅独占隐藏侧渲染（isMaxHidden 判据），点击 setMaximize(null)', () => {
    expect(wl).toContain('wl-restore-rail');
    expect(wl).toMatch(/v-if="isMaxHidden\(spec\)"/);
    expect(wl).toMatch(/@click="setMaximize\(null\)"/);
    expect(wl).toContain('function isMaxHidden(');
    /* 判据与 0 宽压 Conditions 同域：maximizedId 在场+maximizable+非本尊（手动折叠不渲染） */
    const fnAt = wl.indexOf('function isMaxHidden');
    expect(wl.slice(fnAt, fnAt + 300)).toMatch(/maximizedId\.value != null && spec\.maximizable === true && maximizedId\.value !== spec\.id/);
  });
  it('竖轨悬停提示「点此还原」（title/aria 同源）', () => {
    expect(wl).toMatch(/:title="restoreRailTitle\(spec\)" :aria-label="restoreRailTitle\(spec\)"/);
    expect(wl).toContain('点此还原对半分栏');
  });
  it('竖轨视觉语言在场：行布局竖排直立轨（ResizablePane 折叠竖标轨同语言）+stacked 横向退化', () => {
    const vertical = wl.match(/\.wl:not\(\.stacked\):not\(\[data-layout-axis='horizontal'\]\) \.wl-restore-rail \{[^}]*\}/)?.[0];
    expect(vertical, '行布局竖排轨').toBeTruthy();
    expect(vertical).toContain('writing-mode: vertical-rl');
    const horizontal = wl.match(/\.wl\.stacked \.wl-restore-rail[^{]*\{[^}]*\}/)?.[0];
    expect(horizontal, 'stacked 横向退化').toBeTruthy();
  });
});

describe('B：结果柄方向反转修治+表格默认大（553 批）', () => {
  it('结果柄方向换算：pointerdown/focus 快照锚+反向增量（SplitHandle 组件黑名单零触）', () => {
    expect(dq).toContain('@pointerdown.capture="onResultDragAnchor"');
    expect(dq).toContain('@focus.capture="onResultDragAnchor"');
    expect(dq).toMatch(/function onResultDragAnchor/);
    expect(dq, '反向：向下拖（raw 增）=高度减').toMatch(/resultDragBaseH - \(raw - resultDragBaseRaw\)/);
  });
  it('552 clamp 口径保留（320..视口-260；dq.resultH 偏好/定高内联零触）', () => {
    expect(dq).toMatch(/usePref<number>\('dq\.resultH', 0\)/);
    const fnAt = dq.indexOf('function onResultResize');
    const fn = dq.slice(fnAt, fnAt + 400);
    expect(fn).toMatch(/Math\.max\(320, desired\)/);
    expect(fn).toMatch(/store\.viewportH - 260/);
    expect(fn, '视口高直读退役（响应式单源）').not.toMatch(/window\.innerHeight/);
  });
  it('构建区缺省收起=表格默认大（buildCollapsed 缺省 true；行为变更备案）', () => {
    expect(dq).toMatch(/const buildCollapsed = usePref\('query\.buildCollapsed', true\)/);
  });
});

describe('C：直方图开关四迁执行行右组 Profile 旁（553 批，用户终审；558 批同步更新：节壳改用 HistogramSection，节头内容锁同步更新组件源）', () => {
  const runRowAt = dq.indexOf('<div class="dq-run-row">');
  const runRowEnd = dq.indexOf('dq-params-standalone');
  const runRow = dq.slice(runRowAt, runRowEnd);
  const hsAt = dq.indexOf('<HistogramSection');
  const hsTag = dq.slice(hsAt, dq.indexOf('/>', hsAt));
  it('开关在执行行（run-row 切片）：Profile 同款 .dq-sw 激活胶囊+跟随 Profile 之后', () => {
    expect(runRow).toContain('v-model="autoHist"');
    expect(runRow).toContain(':class="{ on: autoHist }"');
    expect(runRow).toContain('class="dq-sw dq-bar-hist"');
    expect(runRow.indexOf('v-model="profileOn"')).toBeGreaterThan(-1);
    expect(runRow.indexOf('v-model="profileOn"'), 'Profile 旁（其后紧随）').toBeLessThan(runRow.indexOf('v-model="autoHist"'));
  });
  it('节头行不再承载开关（直方图分布标题+meta+清除刷选+柱状图本体由组件承接；558 host 档改用标签零触）', () => {
    expect(hsTag, '改用标签不承载开关').not.toContain('v-model="autoHist"');
    expect(hist, '直方图分布标题组件承接').toContain('直方图分布');
    expect(dq, 'histHeadMeta 字面经 meta prop 直喂（549/553 切片锚同步更新）').toContain(':meta="histHeadMeta"');
    expect(hist, '清除刷选组件承接').toContain('清除刷选');
    expect(hist).toContain('<AggBarChart');
  });
  it('无时间字段弱化徽标随开关同行（dq-hist-none 语义保留）', () => {
    expect(runRow).toContain('dq-hist-none');
  });
});

describe('D：Profile 树移出参数面板（553 批，独立块）', () => {
  it('params-body 在 Profile 块之前已闭合（树不再藏进 paramsOpen 折叠面）', () => {
    const paramsAt = dq.indexOf('class="dq-params-body dq-params-standalone"');
    const profAt = dq.indexOf('<div v-if="profileTree"');
    expect(paramsAt).toBeGreaterThan(-1);
    expect(profAt).toBeGreaterThan(paramsAt);
    const seg = dq.slice(paramsAt, profAt);
    expect(seg).toContain('<RootExtrasPane');
    expect(seg, 'Profile 内容不在参数面板内').not.toContain('<ProfileNode');
    expect((seg.match(/<\/div>/g) || []).length, 'params-body 恰闭合一次（树已移出）').toBe(1);
  });
  it('Profile 块只受 profileTree 数据门控（queryFlat534 字面锁保形：类名/关闭钮/CSS 零触）', () => {
    /* 五百六十五批同步更新（击穿者：565 件④② Profile 树限高接 dq.profH 三档）——开标签补
       :style="profStyle"（内联 max-height 覆盖，缺省档=CSS 冻结值同值零漂移） */
    expect(dq).toContain('<div v-if="profileTree" class="dq-profile" :style="profStyle">');
    expect(dq).toContain('@click="profileTree = null"');
  });
});

describe('E：构建节头与场景下拉对调（553 批，构建节头先行）', () => {
  it('dq-tb-l 顺序：构建节头钮 → toolbar-prepend（日常场景）→ 模板钮', () => {
    const buildAt = dq.indexOf('dq-build-tg');
    const prepAt = dq.indexOf('<slot name="toolbar-prepend" />');
    const tplAt = dq.indexOf('> 模板</button>');
    expect(buildAt).toBeGreaterThan(-1);
    expect(buildAt, '构建节头先行').toBeLessThan(prepAt);
    expect(prepAt).toBeLessThan(tplAt);
  });
});

describe('F：检索参数/应用质感升级（553 批，去廉价感；--ctl-h 三锁零触）', () => {
  it('检索参数 tg=细描边胶囊+激活柔底（track2Wave551 无框档修订备案）', () => {
    expect(dq).toMatch(/class="dq-params-tg" :class="\{ on: paramsOpen \}"/);
    const base = dq.match(/^\.dq-params-tg \{[^}]*\}/m)?.[0];
    expect(base, '细描边').toMatch(/border: 1px solid var\(--line\)/);
    expect(base, '胶囊圆角').toMatch(/border-radius: var\(--r-s\)/);
    expect(base, '实底').toMatch(/background: var\(--bg1\)/);
    const on = dq.match(/^\.dq-params-tg\.on \{[^}]*\}/m)?.[0];
    expect(on, '激活态 accent-soft 底').toMatch(/background: var\(--ac-soft\)/);
  });
  it('应用钮=描边实底次级钮+icon（dqFix552 三件全 ghost 修订备案；清除钮仍 ghost）', () => {
    expect(dq).toContain('class="btn sm" @click="applyJq"');
    const runRowAt = dq.indexOf('<div class="dq-run-row">');
    const runRow = dq.slice(runRowAt, dq.indexOf('dq-params-standalone'));
    expect(runRow, '应用钮带 13 档 icon（543 图标一档）').toMatch(/<Check :size="13" \/> 应用/);
    expect(dq, '旧 ghost 应用钮退役').not.toContain('class="btn sm ghost" @click="applyJq"');
  });
  it('26px 控制线三锁零触（dqRunRowUnify547/dqHeightUnify549 冻结面）', () => {
    expect(dq).toMatch(/\.dq-run-row \{[^}]*--ctl-h: 26px/);
    expect(dq).toMatch(/\.dq-run-row \.dq-sw \{[^}]*height: var\(--ctl-h\)/);
    expect(dq).toMatch(/\.dq-run-row \.dq-eh-btn \{[^}]*height: var\(--ctl-h\)/);
    expect(dq).toMatch(/\.dq-run-row :deep\(\.btn\.sm\) \{ height: var\(--ctl-h\); \}/);
    expect(dq).toContain('.dq-run-row .dq-params-tg { height: var(--ctl-h); }');
  });
});
