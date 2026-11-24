/* 786 批·双刀看守（用户令「全部优化全部干」=⑥785 候选全授权）：
 *
 * 刀A【script 域死代码清零】（死码域下一程=⑥785 建议 4 兑现；785 两轮扫描器
 * 方法论平移到 script 域，三折修正后的终名单）——9 文件 19 符号：
 *   ①RootExtrasPane：computed(vue)/ChevronRight(lucide) 双死 import；
 *   ②ClusterSwitcher：ROLE_OPTS 常量（角色筛选下拉退役后孤儿）；
 *   ③CmdPalette：ExternalLink；
 *   ④QueryResultTable：firstBizCol computed——「236 批：仅菜单语义保留」注释已失实
 *     （菜单 run 回调早已换 menuCopyDsl 系，本符号全文件零消费），随删诚实化；
 *   ⑤ResultTable：menuCopyVal/menuCopyId/menuCopyRow/menuSortCol 四函数（单元格
 *     菜单重构后的处理器孤儿，run 回调现役=menuCopyDsl/menuCopySelTerms/copyCell 系）；
 *   ⑥DslQueryView：Info/Maximize2/Minimize2；⑦HealthReportView：fmtNum；
 *   ⑧QueryHubView：ScanSearch/Flame/Grid3x3/SlidersHorizontal/Gauge 五图标
 *     （模式图标 icon-map 现役另有其名）；⑨WorkspaceView：Clock。
 * 假阳性甄别备案（勿抄回删）：DevToolsView vFocus=v-focus 指令消费（const 域
 * 亦须查 kebab 形态）；N 系与 v 系前缀 import 须查 kebab（n-modal）；template 域死分支
 * 扫描零命中（无字面 false 或被注释条件）不立刀。
 *
 * 刀B【.tbl 分层浓度调档】（784 观察项升格=用户令全授权落地）——theme 层引入
 * .tbl 专用语义 token，比现行 --bg2/--hl-soft 深一档=克制增强（设计基调
 * utilitarian 不变），不波及输入框/hover 等 --bg2/--hl-soft 全局消费面：
 *   --tbl-th：暗 #1d2c2f / 浅 #edf0f4（表头底，现行 --bg2=#172224/#f2f4f7 深一档）
 *   --tbl-zebra：暗 rgba(255,255,255,.065) / 浅 rgba(15,23,42,.05)
 *     （斑马罩，现行 --hl-soft=.05/.04 升一档）
 * 消费面=theme.css .tbl th background 与 .tbl.zebra even 行——全站 .tbl 消费
 * （AdhocRebuild 两表+MappingFieldTree+监控三表）token 化自动生效。
 *
 * 断言口径：源文本层（783/785 同款）；strip 注释后断言；尾界 (?![\w-]) 防前缀近亲。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = join(__dirname, '..');
const vue = (rel: string) => readFileSync(join(srcDir, rel), 'utf8');
const css = () => readFileSync(join(srcDir, 'theme.css'), 'utf8');
const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const hasWord = (code: string, w: string) => new RegExp('\\b' + w + '\\b').test(strip(code));

describe('deadScriptTone786 · 刀A script 域死代码清零（19 符号/9 文件）', () => {
  it('A1 RootExtrasPane：ChevronRight 死 import 清零（computed 已于 998 批由 qpKeys 复活）', () => {
    const code = strip(vue('components/builder/RootExtrasPane.vue'));
    /* computed(vue)：786 清的是当时零消费的死 import；998 批「查询参数」分区
       的 qpKeys = computed(...) 是真实消费面，看守退出——若未来再清零 qpKeys，
       请把本断言一并复原（先确认无消费）。 */
    expect(hasWord(code, 'ChevronRight'), 'ChevronRight 死 import 复发').toBe(false);
  });

  it('A2 ClusterSwitcher：ROLE_OPTS 死常量清零', () => {
    expect(hasWord(vue('components/ClusterSwitcher.vue'), 'ROLE_OPTS'), 'ROLE_OPTS 死常量复发').toBe(false);
  });

  it('A3 CmdPalette：ExternalLink 死 import 清零', () => {
    expect(hasWord(vue('components/CmdPalette.vue'), 'ExternalLink'), 'ExternalLink 死 import 复发').toBe(false);
  });

  it('A4 QueryResultTable：firstBizCol 死 computed 清零（236 批保留注释已失实随删）', () => {
    expect(hasWord(vue('components/QueryResultTable.vue'), 'firstBizCol'), 'firstBizCol 死 computed 复发').toBe(false);
  });

  it('A5 ResultTable：menuCopyVal/menuCopyId/menuCopyRow/menuSortCol 四死函数清零', () => {
    const code = strip(vue('components/ResultTable.vue'));
    for (const s of ['menuCopyVal', 'menuCopyId', 'menuCopyRow', 'menuSortCol']) {
      expect(hasWord(code, s), `死函数 ${s} 复发`).toBe(false);
    }
  });

  it('A6 DslQueryView：Info/Maximize2/Minimize2 死 import 清零', () => {
    const code = strip(vue('views/DslQueryView.vue'));
    for (const s of ['Maximize2', 'Minimize2']) {
      expect(hasWord(code, s), `死 import ${s} 复发`).toBe(false);
    }
    expect(code.includes(' Info,'), 'Info 死 import 复发（import 语句形态）').toBe(false);
  });

  it('A7 HealthReportView：fmtNum 死 import 清零', () => {
    const code = strip(vue('views/HealthReportView.vue'));
    expect(code.includes('fmtNum,'), 'fmtNum 死 import 复发（import 语句形态）').toBe(false);
  });

  it('A8 QueryHubView：五死图标 import 清零', () => {
    const code = strip(vue('views/QueryHubView.vue'));
    for (const s of ['ScanSearch', 'Grid3x3', 'SlidersHorizontal', 'Gauge']) {
      expect(hasWord(code, s), `死图标 import ${s} 复发`).toBe(false);
    }
    expect(code.includes('Flame,'), 'Flame 死 import 复发（import 语句形态）').toBe(false);
  });

  it('A9 WorkspaceView：Clock 死 import 清零', () => {
    const code = strip(vue('views/WorkspaceView.vue'));
    expect(code.includes('Clock,'), 'Clock 死 import 复发（import 语句形态）').toBe(false);
  });

  /* —— 刀A 活锚（防全删绿/防误删活符号） —— */
  it('A10 活锚：现役菜单处理器与指令在（防误删邻域）', () => {
    const rt = strip(vue('components/ResultTable.vue'));
    expect(hasWord(rt, 'menuCopyDsl'), 'menuCopyDsl 现役处理器丢失').toBe(true);
    expect(hasWord(rt, 'menuCopySelTerms'), 'menuCopySelTerms 现役处理器丢失').toBe(true);
    const dt = vue('views/DevToolsView.vue');
    expect(new RegExp('v-focus').test(dt), 'v-focus 指令（活，勿删 vFocus）丢失').toBe(true);
    const qh = strip(vue('views/QueryHubView.vue'));
    expect(hasWord(qh, 'TerminalSquare'), 'TerminalSquare 现役图标丢失').toBe(true);
  });
});

describe('deadScriptTone786 · 刀B .tbl 分层浓度调档（token 化）', () => {
  it('B1 --tbl-th/--tbl-zebra 双主题语义 token 定义在场（暗+浅各一）', () => {
    const c = css();
    expect((c.match(/--tbl-th:/g) || []).length, '--tbl-th 须暗浅双定义').toBe(2);
    expect((c.match(/--tbl-zebra:/g) || []).length, '--tbl-zebra 须暗浅双定义').toBe(2);
    expect(c).toMatch(/--tbl-th:\s*#1d2c2f/);
    expect(c).toMatch(/--tbl-th:\s*#edf0f4/);
    expect(c).toMatch(/--tbl-zebra:\s*rgba\(255,\s*255,\s*255,\s*\.065\)/);
    expect(c).toMatch(/--tbl-zebra:\s*rgba\(15,\s*23,\s*42,\s*\.05\)/);
  });

  it('B2 .tbl th 表头底消费 --tbl-th（sticky 行 background 换档）', () => {
    const c = strip(css());
    expect(/\.tbl th \{[^}]*background:\s*var\(--tbl-th\)/s.test(c), '.tbl th 须消费 --tbl-th').toBe(true);
  });

  it('B3 .tbl.zebra 斑马行消费 --tbl-zebra', () => {
    const c = strip(css());
    expect(/\.tbl\.zebra tbody tr:nth-child\(even\)\s*\{[^}]*background:\s*var\(--tbl-zebra\)/s.test(c), '.tbl.zebra 须消费 --tbl-zebra').toBe(true);
  });

  it('B4 行 hover 语义不动（--bg2 仍为悬浮档基），784 改用三件完整保留', () => {
    const c = strip(css());
    expect(/\.tbl tbody tr:hover\s*\{[^}]*background:\s*var\(--bg2\)/s.test(c), '行 hover 仍走 --bg2').toBe(true);
    expect(/\.tbl tbody tr:hover\s*\{[^}]*inset 3px 0 0 var\(--ac-hi\)/s.test(c), 'hover 品牌青左条保留').toBe(true);
    expect(/\.tbl th \{[^}]*position:\s*sticky/s.test(c), 'th sticky 保留').toBe(true);
  });
});
