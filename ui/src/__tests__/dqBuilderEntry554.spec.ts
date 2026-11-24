/**
 * 五百五十四批：查询构建器入口大气化升级（源码静态锁定，readFileSync 形态同族 dqUx553/dqFix552）。
 * 用户实报「查询构建器这个按钮感觉不够大气美观，没有凸显出来比较重要的能力」——打开条件树
 * 构建器（QueryTreePane）是查询工作台高频核心能力，原入口=无框文字钮（chevron+「查询构建
 * 与编辑」+「· 条件 N 个」摘要），视觉权重与重要性失配。
 * 升级语言=553 六终审形态（.dq-params-tg 细描边胶囊）同族：Workflow icon（13 一档）+
 * 「查询构建器」文案+条件计数徽标（ac-soft 圆角计数 chip、650 字重、0 灰态）+展开态激活
 * 柔底（.on=「当前在编辑构建器」状态感知）+chevron 旋转保留。
 * 三条红线零触：buildCollapsed 机制与缺省值（553 裁决 usePref true）/高度链（.dq-main、
 * dq.mainH、dq.resultH 机制）/执行行 26px 控制线（--ctl-h 三锁归 dqRunRowUnify547 冻结面）。
 * 自适应口径（§D）：新形态净宽窄于旧形态（文案 7 字→5 字+meta 摘要退役为紧凑徽标），
 * dq-toolbar 左段 overflow:hidden 收纲余量只增不减——1100/900 档零新增挤压面，不收纲。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

/* 入口钮切片：从完整 class 串起到 toolbar-prepend 槽前（542/553 顺序锁同口径） */
const btnSeg = () => dq.slice(dq.indexOf('class="dq-sec-tg dq-build-tg"'), dq.indexOf('<slot name="toolbar-prepend" />'));

describe('A：入口形态（554 批，无框文字钮→细描边胶囊+icon+徽标+激活态）', () => {
  it('胶囊钮在场：dq-build-tg 类保留（542/553 顺序锁锚）+on 激活类绑定', () => {
    expect(btnSeg()).toContain('class="dq-sec-tg dq-build-tg" :class="{ on: !buildCollapsed }"');
  });
  it('Workflow icon+「查询构建器」文案（icon 13 一档；543 图标一档口径）', () => {
    expect(btnSeg()).toContain('<Workflow :size="13" />');
    expect(btnSeg()).toContain('查询构建器');
    expect(dq.match(/import \{[^}]*\} from 'lucide-vue-next'/)?.[0]).toContain('Workflow');
  });
  it('chevron 展开态旋转保留（收起 -90°，transition var(--tr)）', () => {
    expect(btnSeg()).toMatch(/<ChevronDown :size="13" :style="\{ transform: buildCollapsed \? 'rotate\(-90deg\)' : '', transition: 'transform var\(--tr\)' \}" \/>/);
  });
  it('条件计数徽标：数字徽标绑定 queryCondCount+0 灰态类', () => {
    expect(btnSeg()).toMatch(/<span class="dq-build-n" :class="\{ zero: queryCondCount === 0 \}">\{\{ queryCondCount \}\}<\/span>/);
  });
  it('徽标视觉：ac-soft 圆角计数 chip+650 字重（themeDiscipline525 徽标档），0=bg2 灰态', () => {
    const badge = dq.match(/^\.dq-build-n \{[^}]*\}/m)?.[0];
    expect(badge, 'ac-soft 底').toMatch(/background: var\(--ac-soft\)/);
    expect(badge, 'ac 字色').toMatch(/color: var\(--ac\)/);
    expect(badge, '圆角 chip').toMatch(/border-radius: 99px/);
    expect(badge, '数字徽标 650 档').toMatch(/font-weight: 650/);
    expect(badge, '无 700/800 越轨').not.toMatch(/font-weight:\s*[78]00/);
    const zero = dq.match(/^\.dq-build-n\.zero \{[^}]*\}/m)?.[0];
    expect(zero, '0 灰态底').toMatch(/background: var\(--bg2\)/);
    expect(zero, '0 灰态字色').toMatch(/color: var\(--tx2\)/);
  });
  it('展开态激活柔底+hover 描边（.dq-params-tg 同语言；「当前在编辑构建器」状态感知）', () => {
    const on = dq.match(/^\.dq-build-tg\.on \{[^}]*\}/m)?.[0];
    expect(on).toMatch(/background: var\(--ac-soft\)/);
    expect(on).toMatch(/border-color: var\(--ac-line\)/);
    expect(on).toMatch(/color: var\(--ac\)/);
    expect(dq).toContain('.dq-build-tg:hover { color: var(--ac); border-color: var(--ac-line); }');
  });
  it('胶囊基形=553 六同款：细描边+实底 bg1+r-s 圆角+width:auto 覆写（.dq-sec-tg 基类零触）', () => {
    const base = dq.match(/^\.dq-build-tg \{[^}]*\}/m)?.[0];
    expect(base, '细描边').toMatch(/border: 1px solid var\(--line\)/);
    expect(base, '实底').toMatch(/background: var\(--bg1\)/);
    expect(base, '胶囊圆角').toMatch(/border-radius: var\(--r-s\)/);
    expect(base, '覆写 .dq-sec-tg 的 width:100%').toMatch(/width: auto/);
    expect(base, '不吃缩（徽标不被挤压裁切）').toMatch(/flex: 0 0 auto/);
    /* .dq-sec-tg 基类为直方图节头共用（dqFix552 锁面），字面零触 */
    expect(dq).toMatch(/\.dq-sec-tg \{ display: flex; align-items: center; gap: var\(--sp-1\); width: 100%; font-size: var\(--fs-xs\); font-weight: 600; color: var\(--tx1\); background: none; border: none; padding: var\(--sp-1\) 0; cursor: pointer; text-align: left; \}/);
  });
});

describe('B：计数源（徽标与旧摘要同源 computed）', () => {
  it('queryCondCount ← countNodes(queryTree.root) 同源复用（字面锁，与构建器条件数同口径）', () => {
    expect(dq).toContain('const queryCondCount = computed(() => queryTree.value?.root ? countNodes(queryTree.value.root) : 0);');
  });
  it('旧摘要 meta（「已收起」/「条件 N 个」）退役——紧凑化由徽标承担', () => {
    const seg = btnSeg();
    expect(seg).not.toContain('已收起');
    expect(seg).not.toContain('条件 {{ queryCondCount }} 个');
    expect(seg).not.toContain('dq-sec-meta');
  });
});

describe('C：行为零变化（红线）', () => {
  it('buildCollapsed 机制与缺省值零触（553 裁决 usePref true+折叠联动+双入口）', () => {
    expect(dq).toContain("usePref('query.buildCollapsed', true)");
    expect(dq).toContain('v-show="!buildCollapsed"');
    expect(dq).toContain('watch(buildCollapsed, (collapsed) => { if (collapsed) paramsOpen.value = false; });');
    expect(dq).toMatch(/@click="buildCollapsed = !buildCollapsed"/);
    /* 表格头「顶满/还原」双入口常驻（553 B 裁决的第二入口） */
    expect(dq).toContain(':class="{ on: buildCollapsed }"');
  });
  it('高度链零触：.dq-main 基线与执行行 26px 控制线冻结面原样', () => {
    expect(dq).toMatch(/\.dq-main \{ display: flex; gap: 0; align-items: stretch; flex: 0 0 auto; min-height: 220px; isolation: isolate; \}/);
    expect(dq).toMatch(/\.dq-run-row \{ --ctl-h: 26px; \}/);
    expect(dq).toMatch(/\.dq-run-row \.dq-sw \{[^}]*height: var\(--ctl-h\)/);
    expect(dq).toMatch(/\.dq-run-row \.dq-eh-btn \{[^}]*height: var\(--ctl-h\)/);
    expect(dq).toContain('.dq-run-row .dq-params-tg { height: var(--ctl-h); }');
    /* 入口钮不在执行行作用域内（26px 控制线机制零触；height 26px 是 dq-toolbar 侧独立声明） */
    expect(dq).not.toMatch(/\.dq-run-row[^{]*\.dq-build-tg/);
  });
  it('构建节头先行顺序锁同步更新不破（542 三行合一+553 E 对调）', () => {
    const tbAt = dq.indexOf('class="dq-toolbar lr-bar"');
    const buildAt = dq.indexOf('dq-build-tg');
    const prepAt = dq.indexOf('<slot name="toolbar-prepend" />');
    const tplAt = dq.indexOf('> 模板</button>');
    expect(buildAt).toBeGreaterThan(tbAt);
    expect(prepAt).toBeGreaterThan(buildAt);
    expect(tplAt).toBeGreaterThan(prepAt);
  });
});

describe('D：1100/900 自适应（不收纲裁决的依据）', () => {
  it('净宽不增：文案 7 字→5 字+摘要句退役为紧凑徽标（dq-toolbar 左段 overflow:hidden 余量只增）', () => {
    const seg = btnSeg();
    expect(seg).toContain('查询构建器');
    expect(seg).not.toContain('查询构建与编辑');
    expect('查询构建器'.length, '文案缩短 2 字').toBeLessThan('查询构建与编辑'.length);
  });
  it('两档契约不回退（responsive900Sweep529 口径）：1100/900 档在场+左段 nowrap 收纲机制原样', () => {
    expect(dq).toContain('@media (max-width: 1100px)');
    const block900 = dq.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);
    expect(block900, '900 档在场且非空').toBeTruthy();
    expect(block900![0]).toMatch(/\{[^{}]+\}/);
    expect(dq).toContain('.dq-toolbar .lr-bar-l { flex: 1 1 auto; overflow: hidden; }');
    expect(dq).toContain('.dq-toolbar .lr-bar-l, .dq-toolbar .lr-bar-r { flex-wrap: nowrap; white-space: nowrap; }');
    /* 徽标/文案类无窄档特化（零新增挤压面故不收纲；若未来收纲应落在这两档内） */
    expect(block900![0]).not.toContain('dq-build');
    const block1100 = dq.match(/@media \(max-width: 1100px\) \{[\s\S]*?\n\}/)!;
    expect(block1100[0]).not.toContain('dq-build');
  });
});
