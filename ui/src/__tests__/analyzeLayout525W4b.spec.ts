/**
 * 五百二十五批 W4b：分词验证/分词实验室布局可调修复——
 *  AnalyzeView（页头「分词验证（Analyze）」）：
 *   ① 窄屏 stacked 坍缩修复（.av-left > .monaco-host flex:1 1 0 + min-height:260px 兜底，
 *      BulkEditorView .be-card-editor 同款）；
 *   ② 结果 pane 原文块/Token 表纵缝 SplitHandle（av.splitPct 记忆，px 定高，0=auto）；
 *   ③ body Monaco dsl-assist 接线（useIndexFields 惰性 fields + analysisSettings 惰性
 *      analyzers 通道 + bodyKind 'analyze' 档——'analyze' 枚举值由并行批 W5b 落地）；
 *   ④ Token 表 position/offset/length 数值列右对齐（.num）+ title 原值；
 *  AnalyzerLabView（分词实验室）：
 *   ⑤ 待分词输入 rows 3→6（al.taH 拖拽记忆 520 批已在，防回退顺带锁）；
 *   ⑥ 字段清单限高 usePref al.fieldsH 三档（原 CSS 写死 280px 退役）；
 *   ⑦ lane 双栏纵缝连续拖拽（al.laneW，duo 档 CSS 变量 --al-lane-w）+ 两档按钮降预设
 *      + ≥3 列 auto-fit 修正孤列 + 窄屏断点 duo 让位/柄隐藏；
 *   ⑧ lane 头/尾「底色+线」双保险统一为线语言（两处 background 退役）；
 *   ⑨ 页内 IndexPicker 退役换 CurrentIdxChip（换索引清字段清单语义由 watch(index) 承接）。
 *
 * 形态说明：AnalyzeView 含 Monaco（happy-dom 挂载成本高）走源码锁 + SFC 编译冒烟；
 * AnalyzerLabView 轻组件挂载做运行时档位/类名/内联变量断言（analyzerAdjustW2 同设施）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const rd = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const analyze = rd('../views/AnalyzeView.vue');
const lab = rd('../views/AnalyzerLabView.vue');

/* ═══════════ AnalyzeView（源码锁） ═══════════ */
describe('525 AnalyzeView：stacked 坍缩修复 + 结果区纵缝 + assist 接线 + 数值列', () => {
  it('① 窄屏 stacked 坍缩修复：monaco-host flex 兜底（BulkEditorView 范式）', () => {
    expect(analyze).toMatch(/\.av-left \{ height: 100%; \}/);
    expect(analyze).toMatch(/\.av-left > :deep\(\.monaco-host\) \{ flex: 1 1 0; min-height: 260px; \}/);
  });
  it('② 原文/Token 表纵缝：SplitHandle horizontal + av.splitPct 记忆 + 表区吃剩余', () => {
    expect(analyze).toContain("import SplitHandle from '../components/SplitHandle.vue';");
    expect(analyze).toMatch(/axis="horizontal"/);
    expect(analyze).toMatch(/const avSplitH = usePref\('av\.splitPct', 0\);/);
    expect(analyze).toMatch(/function clampAvSplitH\(s: number\)/);
    expect(analyze).toMatch(/@resize-end="\(s: number\) => avSplitH = clampAvSplitH\(s\)"/);
    expect(analyze).toMatch(/@reset="avSplitH = 0"/);
    /* 拖过（>0）原文块定高内滚；未拖 flex:0 0 auto 自然高（原硬堆叠视觉） */
    expect(analyze).toMatch(/avSplitH > 0 \? \{ flex: '0 0 auto', height: avSplitH \+ 'px' \} : undefined/);
    expect(analyze).toMatch(/\.av-original \{ flex: 0 0 auto; overflow: auto;/);
    expect(analyze).toMatch(/\.av-tk-tbl-wrap \{ flex: 1 1 0; min-height: 120px;/);
  });
  it('③ body Monaco dsl-assist：惰性 fields + 惰性 analyzers（analysisSettings 范式）+ analyze 档', () => {
    expect(analyze).toMatch(/:dsl-assist="avBodyAssist"/);
    expect(analyze).toMatch(/useIndexFields\(\(\) => index\.value\)/);
    expect(analyze).toMatch(/api\.analysisSettings\(idx\)/);
    /* 按索引记忆一次，失败静默空=值位通道关闭（MappingView 弹层同款守卫） */
    expect(analyze).toMatch(/if \(!idx \|\| analyzersLoadedFor === idx\) return;/);
    /* 2.1.6：失败支先过世代/索引双判再清空（旧索引晚到的失败不得清掉新索引候选） */
    expect(analyze).toMatch(/catch \{\s*if \(seq !== analyzerSeq \|\| idx !== index\.value\.trim\(\)\) return;\s*analyzerCandidates\.value = \[\];/);
    /* 三组件名候选通道 + analyze BodyKind 档（W5b 并行落地）；1439 起按类别分列，
       通道自身触发惰性拉取（组件值位不读 fields，单靠 fields 触发拉不到自定义名） */
    expect(analyze).toMatch(/Object\.keys\(a\.analyzer \|\| \{\}\)/);
    for (const [chan, ref] of [
      ['tokenizers', 'tokenizerCandidates'],
      ['normalizers', 'normalizerCandidates'],
      ['filters', 'filterCandidates'],
      ['charFilters', 'charFilterCandidates'],
    ]) {
      expect(analyze, chan).toMatch(new RegExp(`${chan}: \\(\\) => \\{[\\s\\S]{0,140}?return ${ref}\\.value;`));
    }
    expect(analyze).toMatch(/bodyKind: \(\) => 'analyze' as any/);
    /* 惰性触发挂在 fields()（补全触发才拉，挂载零请求） */
    expect(analyze).toMatch(/void ensureAssistFields\(\); void loadAnalyzerNames\(\);/);
  });
  it('④ Token 表数值三列右对齐 + title 原值（529 反转同步更新：fieldTypes double → 内核 num-col 右对齐+徽标，title 走 #cell- 槽）', () => {
    /* 五百二十九批锚同步更新：th class=num 三列 / .av-tk-tbl td.num 右对齐 CSS 退役——
       右对齐与双层列头徽标改由 QRT fieldTypes 显式 double（num-col）承担 */
    expect(analyze).toMatch(/const AV_TOKEN_TYPES: Record<string, string> = \{ 序位: 'double', 字符区间: 'double', 长度: 'double' \}/);
    /* title 原值锚同步更新：r.t.* → #cell- 槽 value（ES 原始字段名可查证语义不变） */
    expect(analyze).toMatch(/:title="'position=' \+ value"/);
    expect(analyze).toMatch(/:title="'start_offset=' \+ String\(value\)\.split\('-'\)\[0\] \+ ' · end_offset=' \+ String\(value\)\.split\('-'\)\[1\]"/);
    expect(analyze).toMatch(/:title="'length=' \+ value"/);
  });
});

/* ═══════════ AnalyzerLabView（源码锁） ═══════════ */
describe('525 AnalyzerLabView：输入行数 + 清单限高档 + lane 连续可调/孤列修正 + 线语言 + chip', () => {
  it('⑤ 待分词输入 rows=6（拖拽记忆 al.taH 保留防回退）', () => {
    expect(lab).toMatch(/class="al-txt" rows="6"/);
    expect(lab).toMatch(/usePref<string>\('al\.taH', ''\)/);
    expect(lab).not.toMatch(/rows="3"/);
  });
  it('⑥ 字段清单限高 al.fieldsH 三档（558 合并 useTierCycle），CSS 写死 280px 退役', () => {
    /* 五百五十八批同步更新（击穿者：558 工蚁G——三件套合并 useTierCycle 单源）：
       usePref 声明字面改合并接线锚（默认档 280 显式传参零迁） */
    expect(lab).toMatch(/useTierCycle\('al\.fieldsH', FIELDS_H_TIERS, 280\)/);
    expect(lab).toMatch(/const FIELDS_H_TIERS = \[280, 420, 600\];/);
    expect(lab).toMatch(/data-al-flds-h/);
    expect(lab).toMatch(/:style="\{ maxHeight: alFieldsH \+ 'px' \}"/);
    expect(lab).not.toMatch(/\.al-fields \{[^}]*max-height/);
  });
  it('⑦ lane 连续可调：duo 档 al.laneW + 纵缝柄 + 两档降预设 + ≥3 列 auto-fit 孤列修正', () => {
    expect(lab).toMatch(/const alLaneW = usePref\('al\.laneW', 0\);/);
    expect(lab).toMatch(/function clampLaneW\(s: number\)/);
    expect(lab).toMatch(/function presetLaneSplit\(v: 'half' \| '4060'\) \{ laneSplit\.value = v; alLaneW\.value = 0; \}/);
    /* 布局档 computed：恰好 2 列才挂 duo/预设档，1 或 ≥3 列回 auto-fit */
    expect(lab).toMatch(/return alLaneW\.value > 0 \? 'duo' : 'split-' \+ laneSplit\.value;/);
    expect(lab).toMatch(/'--al-lane-w': alLaneW\.value \+ 'px'/);
    /* 纵缝柄仅双栏渲染 */
    expect(lab).toMatch(/v-if="lanes\.length === 2 && i === 0"/);
    expect(lab).toMatch(/axis="vertical"/);
    /* 预设按钮点按走 presetLaneSplit（清连续宽度），高亮跟随实际布局档 */
    expect(lab).toMatch(/@click="presetLaneSplit\('half'\)"/);
    expect(lab).toMatch(/@click="presetLaneSplit\('4060'\)"/);
    expect(lab).toMatch(/:class="\{ on: lanesClass === 'split-half' \}"/);
    /* auto-fit 320 孤列修正 + 预设/duo 档含 11px 柄列 */
    expect(lab).toMatch(/repeat\(auto-fit, minmax\(320px, 1fr\)\)/);
    expect(lab).toMatch(/\.al-lanes\.split-half \{ grid-template-columns: minmax\(0, 1fr\) 11px minmax\(0, 1fr\); \}/);
    expect(lab).toMatch(/\.al-lanes\.split-4060 \{ grid-template-columns: minmax\(0, 4fr\) 11px minmax\(0, 6fr\); \}/);
    expect(lab).toMatch(/\.al-lanes\.duo \{ grid-template-columns: var\(--al-lane-w, minmax\(0, 1fr\)\) 11px minmax\(0, 1fr\); \}/);
    /* 窄屏断点：duo 同让位 + 柄隐藏 */
    expect(lab).toMatch(/\.al-lanes\.split-half, \.al-lanes\.split-4060, \.al-lanes\.duo \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(lab).toMatch(/\.al-lanes :deep\(\.split-handle\) \{ display: none; \}/);
  });
  it('⑧ lane 头/尾统一「线」语言：两处底色退役，分隔线保留（528 批同步更新：padding 合并 var(--sp-*) 兼容形态）', () => {
    expect(lab).toMatch(/\.al-lane-hd \{ display: flex; justify-content: space-between; align-items: center; padding: (?:8px|var\(--sp-2\)) (?:12px|var\(--sp-3\)); border-bottom: 1px solid var\(--border\); \}/);
    expect(lab).toMatch(/\.al-lane-result \{ padding: (?:10px|var\(--sp-2h\)) (?:12px|var\(--sp-3\)); border-top: 1px solid var\(--border\); min-height: 80px; \}/);
    expect(lab).not.toMatch(/\.al-lane-hd \{[^}]*background/);
    expect(lab).not.toMatch(/\.al-lane-result \{[^}]*background/);
  });
  it('⑨ IndexPicker 退役换 CurrentIdxChip：watch(index) 承接清字段清单，.al-inp 孤儿清零', () => {
    expect(lab).toContain('<CurrentIdxChip />');
    expect(lab).toContain("import CurrentIdxChip from '../components/CurrentIdxChip.vue';");
    expect(lab).not.toMatch(/<IndexPicker|from '\.\.\/components\/IndexPicker\.vue'/);
    expect(lab).toMatch(/watch\(index, \(\) => \{ fields\.value = \[\]; fieldsError\.value = ''; \}\);/);
    expect(lab).not.toMatch(/\.al-inp \{/);
  });
});

/* ═══════════ SFC 编译冒烟（源码锁照不住模板语法） ═══════════ */
describe('525 两页 SFC 编译冒烟', () => {
  /* 五百二十九批：AnalyzeView 换 QRT rows 型后模块图扩（+QueryResultTable/xlsxMini/
     tableSnapshot 链），monaco 机器冷变换贴 5s 默认帽——冒烟提额 15s。
     1224：实测这一条**单独跑就要 12981ms**（已占 15s 帽的 87%）。并发门禁在某次机器变慢时
     （分片耗时从 ~410s 涨到 ~660s）它稳定超时并被判「串行复验仍失败」，整包因此转红——
     而代码一行没改。**余量不足的 timeout 会把机器负载报成代码回归**。
     提到 40s 并留注释：这条测的是「模板能否编译」，本身无性能含义，
     慢在 monaco 冷变换的模块图；给它足够余量比反复重跑更有价值。 */
  it('AnalyzeView：SplitHandle/CurrentIdxChip/dsl-assist 模板可编译、模块可加载', { timeout: 40000 }, async () => {
    const m = await import('../views/AnalyzeView.vue');
    expect(m.default).toBeTruthy();
  });
  it('AnalyzerLabView：template v-for+SplitHandle/档位钮模板可编译、模块可加载', async () => {
    const m = await import('../views/AnalyzerLabView.vue');
    expect(m.default).toBeTruthy();
  });
});

/* ═══════════ AnalyzerLabView 运行时（挂载）：lane 档位/纵缝柄/清单档 ═══════════ */
const routeMock = { path: '/analyzer-lab', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      analyzeText: vi.fn(() => Promise.resolve({ tokens: [{ token: 'elas', position: 0, start_offset: 0, end_offset: 4, type: 'ENGLISH' }] })),
      mappingDetail: vi.fn(() => Promise.resolve({ raw: { properties: { bondName: { type: 'text', analyzer: 'ik_max_word' } } } })),
      clusterQuery: () => Promise.resolve({}),
      aliases: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import AnalyzerLabView from '../views/AnalyzerLabView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountLab(idx = '') {
  history.replaceState(null, '', idx ? '#/?idx=' + idx : '#/');
  const app = createApp({ render: () => h(AnalyzerLabView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function btn(host: ParentNode, sel: string): HTMLButtonElement {
  const b = host.querySelector<HTMLButtonElement>(sel);
  expect(b, sel + ' 必须在场').toBeTruthy();
  return b!;
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  for (const k of Object.keys(routeMock.query)) delete routeMock.query[k];
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('525 AnalyzerLabView 运行时：lane 档位与纵缝', () => {
  it('默认 3 lane：auto-fit（无 split-/duo 类、无纵缝柄）——孤列修正', async () => {
    const host = await mountLab();
    const lanes = host.querySelector('.al-lanes') as HTMLElement;
    expect(lanes, '.al-lanes 必须在场').toBeTruthy();
    expect(lanes.className).not.toMatch(/split-|duo/);
    expect(host.querySelector('.al-lanes .split-handle'), '3 列不应渲染纵缝柄').toBeNull();
  });

  it('删到恰好 2 lane：纵缝柄在场；单 lane 回 auto-fit 柄消失', async () => {
    const host = await mountLab();
    const lane = btn(host, '.al-lane-hd .btn[aria-label="删除分词通道"]');
    lane.click(); await settle();
    expect(host.querySelectorAll('.al-lane').length).toBe(2);
    expect(host.querySelector('.al-lanes .split-handle[data-split-axis="vertical"]'), '双栏必须渲染纵缝柄').toBeTruthy();
    lane.click(); await settle();
    expect(host.querySelectorAll('.al-lane').length).toBe(1);
    expect(host.querySelector('.al-lanes .split-handle')).toBeNull();
  });

  it('预置 al.laneW=500 + 双栏：duo 档 + --al-lane-w 内联变量', async () => {
    localStorage.setItem('esquerystudio.pref.al.laneW', '500');
    const host = await mountLab();
    const lane = btn(host, '.al-lane-hd .btn[aria-label="删除分词通道"]');
    lane.click(); await settle();
    const lanes = host.querySelector('.al-lanes') as HTMLElement;
    expect(lanes.classList.contains('duo')).toBe(true);
    expect(lanes.style.getPropertyValue('--al-lane-w')).toBe('500px');
    expect(host.querySelector('.al-lanes .split-handle[data-split-axis="vertical"]')).toBeTruthy();
  });

  it('两档预设点按：双栏 split-4060 生效且清连续宽度（回比例档）', async () => {
    localStorage.setItem('esquerystudio.pref.al.laneW', '500');
    const host = await mountLab();
    const lane = btn(host, '.al-lane-hd .btn[aria-label="删除分词通道"]');
    lane.click(); await settle();
    btn(host, '[data-al-split="4060"]').click();
    await settle();
    const lanes = host.querySelector('.al-lanes') as HTMLElement;
    expect(lanes.classList.contains('split-4060')).toBe(true);
    expect(lanes.classList.contains('duo')).toBe(false);
    expect(localStorage.getItem('esquerystudio.pref.al.laneW')).toBe('0');
    expect(localStorage.getItem('esquerystudio.pref.al.laneSplit')).toBe(JSON.stringify('4060'));
  });
});

describe('525 AnalyzerLabView 运行时：字段清单高度档', () => {
  it('加载字段后 data-al-flds-h 在场，点按 280→420 落盘且内联 maxHeight 跟手', async () => {
    const host = await mountLab('t1');
    const load = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.textContent?.includes('加载 text 字段'));
    expect(load, '「加载 text 字段」必须在场').toBeTruthy();
    load!.click(); await settle();
    const flds = host.querySelector('.al-fields') as HTMLElement;
    expect(flds, '字段清单必须渲染').toBeTruthy();
    expect(flds.style.maxHeight).toBe('280px');
    const tier = btn(host, '[data-al-flds-h]');
    tier.click(); await settle();
    expect(localStorage.getItem('esquerystudio.pref.al.fieldsH')).toBe('420');
    expect((host.querySelector('.al-fields') as HTMLElement).style.maxHeight).toBe('420px');
  });
});
