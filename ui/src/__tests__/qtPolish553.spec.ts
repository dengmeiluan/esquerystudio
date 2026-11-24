/**
 * 五百五十三批：条件树面板头工具行质感升级（用户实报「共 0 条件」胶囊+「过滤条件...」输入框
 * +「折叠全部」「停用全部」文字钮形态简陋廉价，要求大气质感、与页内执行行/工具行质感语言统一）。
 * ①「过滤条件…」裸 input 合并 SearchFilterBar 统一件——547 批三处（wt/fv/tg）后第四处：
 *   同构判定成立（v-model 过滤词 + Enter 命中导航 + 右侧附加件插槽 + Esc 清空内建）；
 *   qtp 特有 Shift+Enter 反向轮转经组件 @enter 转出的原生 KeyboardEvent.shiftKey 承接；
 *   focus 态 accent 边在视图侧补（.qtp-find:focus-within 对齐 theme.css .inp:focus 范式），
 *   不动组件单源（SearchFilterBar 非 553 独占面）；
 * ②折叠/展开、启停两对状态感知循环钮补 lucide icon（ChevronsDown/ChevronsUp、Pause/Play）——
 *   .btn sm ghost 档原样，与 BoolGroupNode 组头 icon 钮语言对齐（541 批收敛结构零触）；
 * ③「共 N 条件」计数徽标升级 .chip.static 质感档（bg2 底+line 边+tabular-nums），数字 mono；
 *   命中计数 N/M 同排 chip 化（同排质感统一）；
 * ④行布局对齐 DQ 执行行 26px 控制线（--ctl-h 语言，DslQueryView .dq-run-row 同式），
 *   间距 var(--sp-*)。
 * 全源码锚 + createApp 挂载双口径（范式同 queryTreePaneButtons541 / fieldSelectPopup）。
 * 行为锁：折叠 window 广播（BGN_COLLAPSE_EVENT 派发与监听两侧）/ setAllDisabled 树写入
 * / onFindKey 轮转函数体 字面零触（not 改断言——只加不改）。
 * 备案：541 批已有「启用全部」恢复入口（hasDisabled 状态感知循环钮），有停用必有恢复，无缺口。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, ref, nextTick, type App } from 'vue';
import QueryTreePane from '../components/builder/QueryTreePane.vue';
import { BGN_COLLAPSE_EVENT } from '../components/builder/BoolGroupNode.vue';
import { parseTree, type QueryTree } from '../utils/queryAst';

const src = readFileSync(join(__dirname, '../components/builder/QueryTreePane.vue'), 'utf-8');
const tpl = src.slice(0, src.indexOf('<script'));
const script = src.slice(src.indexOf('<script setup'));
const bgn = readFileSync(join(__dirname, '../components/builder/BoolGroupNode.vue'), 'utf-8');

/* 按钮行定位（与 541 批同式：'<button' + 文案同行，锁单行形态防 v-if/文案被拆行） */
const btnLine = (label: string) =>
  tpl.split('\n').find(l => l.includes('<button') && l.includes(label));

/* ═══════════ ① 过滤输入框：SearchFilterBar 第四处合并 ═══════════ */
describe('五百五十三批：过滤框合并 SearchFilterBar（第四处）', () => {
  it('合并锚：v-model filterQ + qtp-find 落位 + placeholder 逐字 + @enter 接线 + 插槽计数', () => {
    expect(tpl, 'SearchFilterBar 统一件在场（裸 input 退役；title 提示经 $attrs 透传落根，故锚不锁尾闭合符）')
      .toMatch(/<SearchFilterBar v-model="filterQ" class="qtp-find" placeholder="过滤条件…" @enter="onFindKey"/);
    expect(script, '组件 import 在场').toMatch(/import SearchFilterBar from '\.\.\/SearchFilterBar\.vue';/);
    expect(tpl, '命中计数 N/M 在默认插槽内（wt HitNav 同位）')
      .toMatch(/<SearchFilterBar[\s\S]*?qtp-find-nav[\s\S]*?<\/SearchFilterBar>/);
  });

  it('裸 input 退役：qtp-find 不再是 <input class="inp"> 直渲染', () => {
    expect(tpl, '裸 input 形态必须退役').not.toMatch(/<input[^>]*class="inp qtp-find"/);
  });

  it('focus 态 accent 边：.qtp-find:focus-within 对齐 .inp:focus 范式（ac-line 边 + focus-ring）', () => {
    expect(src, 'focus 态在视图侧补齐（组件单源不动）')
      .toMatch(/\.qtp-find:focus-within \{[^}]*border-color: var\(--ac-line\);/);
    expect(src, 'focus 光晕用全局 --focus-ring token').toMatch(/\.qtp-find:focus-within \{[^}]*var\(--focus-ring\)/);
  });
});

/* ═══════════ ② 循环钮 icon 质感（541 收敛结构兼容） ═══════════ */
describe('五百五十三批：折叠/启停循环钮补 icon（.btn sm ghost 档）', () => {
  it('折叠对：展开=ChevronsUp、折叠=ChevronsDown，ghost 档与 541 状态感知锚同行保留', () => {
    const expand = btnLine('展开全部');
    const fold = btnLine('折叠全部');
    expect(expand, '「展开全部」行在场').toBeTruthy();
    expect(fold, '「折叠全部」行在场').toBeTruthy();
    expect(expand!, 'ghost 档').toMatch(/class="btn sm ghost"/);
    expect(fold!, 'ghost 档').toMatch(/class="btn sm ghost"/);
    expect(expand!, '展开=ChevronsUp（向上展开语义）').toMatch(/<ChevronsUp :size="11" \/>/);
    expect(fold!, '折叠=ChevronsDown（向下折叠语义）').toMatch(/<ChevronsDown :size="11" \/>/);
    /* 541 批锚同步更新：状态感知表达式同行不破 */
    expect(expand!).toMatch(/v-if="anyCollapsed"/);
    expect(fold!).toMatch(/v-else/);
  });

  it('启停对：停用=Pause、启用=Play，ghost 档与 541 状态感知锚同行保留', () => {
    const enable = btnLine('启用全部');
    const disable = btnLine('停用全部');
    expect(enable, '「启用全部」行在场').toBeTruthy();
    expect(disable, '「停用全部」行在场').toBeTruthy();
    expect(enable!, 'ghost 档').toMatch(/class="btn sm ghost"/);
    expect(disable!, 'ghost 档').toMatch(/class="btn sm ghost"/);
    expect(enable!, '启用=Play').toMatch(/<Play :size="11" \/>/);
    expect(disable!, '停用=Pause').toMatch(/<Pause :size="11" \/>/);
    expect(enable!).toMatch(/v-if="hasDisabled"/);
    expect(disable!).toMatch(/v-else/);
  });
});

/* ═══════════ ③ 计数 chip 质感 ═══════════ */
describe('五百五十三批：计数徽标 chip 质感档', () => {
  it('「共 N 条件」升级 .chip.static（非交互徽标档），数字 mono，hot 警示档保留', () => {
    expect(tpl, 'chip static 类在场').toMatch(/class="qtp-cnt chip static"/);
    expect(tpl, '总数数字 mono 包裹').toMatch(/共 <b class="mono">\{\{ leafStats\.total \}\}<\/b> 条件/);
    expect(tpl, 'hot 分档表达式原样（total>10）').toMatch(/:class="\{ hot: leafStats\.total > 10 \}"/);
    expect(src, 'hot 警示档样式保留（warn 系）').toMatch(/\.qtp-cnt\.hot \{[^}]*var\(--warn\)/);
  });

  it('命中计数 N/M 同排 chip 化（同排质感统一）', () => {
    expect(tpl).toMatch(/class="qtp-find-nav chip static mono"/);
  });
});

/* ═══════════ ④ 行布局：26px 控制线（DQ 执行行 --ctl-h 语言） ═══════════ */
describe('五百五十三批：工具行 26px 控制线', () => {
  it('--ctl-h 在 .qtp-hd 定义、输入框与按钮统一消费（DslQueryView .dq-run-row 同式）', () => {
    expect(src, '控制线变量定义').toMatch(/\.qtp-hd \{[^}]*--ctl-h: 26px;/);
    expect(src, '输入框消费控制线').toMatch(/\.qtp-find \{[^}]*height: var\(--ctl-h\);/);
    expect(src, '按钮消费控制线').toMatch(/\.qtp-hd \.btn \{ height: var\(--ctl-h\); \}/);
  });
});

/* ═══════════ 行为锁：折叠广播 / 启停写入 字面零触（not 改断言） ═══════════ */
describe('五百五十三批：行为锁——广播与树写入逻辑字面零触', () => {
  it('折叠 window 广播：BGN_COLLAPSE_EVENT 派发侧（QueryTreePane）与监听侧（BoolGroupNode）原样', () => {
    expect(script, '派发字面零触')
      .toContain("window.dispatchEvent(new CustomEvent(BGN_COLLAPSE_EVENT, { detail: { collapsed } }))");
    expect(script, '541 感知锚同步更新').toContain('anyCollapsed.value = collapsed');
    expect(script, '事件名常量同步更新导入').toMatch(/import BoolGroupNode, \{ BGN_COLLAPSE_EVENT \} from '\.\/BoolGroupNode\.vue';/);
    expect(bgn, '监听侧注册零触').toMatch(/window\.addEventListener\(BGN_COLLAPSE_EVENT, onCollapseEvt\)/);
    expect(bgn, '监听侧处理零触').toMatch(/const onCollapseEvt = \(e: Event\) => \{ collapsed\.value = !!\(e as CustomEvent\)\.detail\?\.collapsed; \}/);
  });

  it('setAllDisabled 树写入字面零触；启停恢复入口完整（有停用必有「启用全部」）', () => {
    expect(script).toContain('function setAllDisabled(disabled: boolean)');
    expect(script).toContain('return { ...x, disabled };');
    expect(script).toContain('setRoot(walk(r));');
    expect(btnLine('启用全部'), '恢复入口在场（541 批已有，备案无缺口）').toBeTruthy();
  });

  it('onFindKey 轮转函数体零触（Shift+Enter 反向语义经 @enter 转出承接）', () => {
    expect(script).toContain('findCur.value = e.shiftKey ? ((findCur.value - 2 + n) % n) + 1 : (findCur.value % n) + 1;');
    expect(script).toContain('applyFindCur();');
  });
});

/* ═══════════ 挂载行为（createApp 手工 mount，范式同 fieldSelectPopup） ═══════════ */
const apps: App[] = [];
async function settle(n = 6) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
function mountTree(src2: unknown) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = parseTree(src2);
  if (!r.ok) throw new Error('bad src');
  const tree = ref(r.tree);
  const app = createApp({
    render: () => h(QueryTreePane, {
      tree: tree.value,
      fields: ['a', 'b', 'c'],
      types: { a: 'keyword', b: 'keyword', c: 'keyword' },
      'onUpdate:tree': (t: QueryTree) => { tree.value = t; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, tree };
}
const btnByLabel = (host: ParentNode, label: string) =>
  Array.from(host.querySelectorAll('button')).find(b => (b.textContent || '').includes(label)) as HTMLElement;

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('五百五十三批：挂载行为（渲染+质感件功能不断）', () => {
  it('渲染：sfb 壳落位 qtp-find、placeholder 逐字、chip 计数读数「共 2 条件」', async () => {
    const { host } = mountTree({ query: { bool: { must: [{ term: { a: 1 } }], filter: [{ term: { b: 2 } }] } } });
    await settle();
    const sfbRoot = host.querySelector('.qtp-find') as HTMLElement;
    expect(sfbRoot, 'SearchFilterBar 根落位类（class 透传落根）').toBeTruthy();
    expect(sfbRoot.classList.contains('sfb'), '组件胶囊壳类在场').toBe(true);
    const inp = sfbRoot.querySelector('input') as HTMLInputElement;
    expect(inp?.placeholder, 'placeholder 逐字').toBe('过滤条件…');
    expect(host.querySelector('.qtp-cnt')!.textContent, '计数读数原语义').toContain('共 2 条件');
    expect(host.querySelector('.qtp-cnt')!.classList.contains('chip'), 'chip 质感档落 DOM').toBe(true);
    expect(host.querySelector('.qtp-find-nav'), '无命中时 N/M 计数不显').toBeNull();
  });

  it('点「折叠全部」：window 广播 BGN_COLLAPSE_EVENT(detail collapsed=true)，按钮翻「展开全部」', async () => {
    const { host } = mountTree({ query: { bool: { must: [{ term: { a: 1 } }] } } });
    await settle();
    const seen: unknown[] = [];
    const spy = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(BGN_COLLAPSE_EVENT, spy);
    btnByLabel(host, '折叠全部').click();
    await settle();
    window.removeEventListener(BGN_COLLAPSE_EVENT, spy);
    expect(seen.length, '广播恰一次').toBe(1);
    expect(seen[0], 'detail.collapsed=true').toEqual({ collapsed: true });
    expect(btnByLabel(host, '展开全部'), '按钮翻反向动作').toBeTruthy();
  });

  it('点「停用全部」：叶全 disabled、chip 显「停用 2」、翻「启用全部」；点「启用全部」恢复', async () => {
    const { host, tree } = mountTree({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }] } } });
    await settle();
    btnByLabel(host, '停用全部').click();
    await settle();
    const leaves = (tree.value.root as any).children.map((c: any) => c.node);
    expect(leaves.every((l: any) => l.disabled === true), '全部叶 disabled=true').toBe(true);
    expect(host.querySelector('.qtp-cnt')!.textContent, '停用分档读数').toContain('停用 2');
    const enable = btnByLabel(host, '启用全部');
    expect(enable, '按钮翻「启用全部」').toBeTruthy();
    enable.click();
    await settle();
    const leaves2 = (tree.value.root as any).children.map((c: any) => c.node);
    expect(leaves2.every((l: any) => l.disabled === false), '全部恢复 disabled=false').toBe(true);
  });

  it('过滤输入功能不断：命中高亮 .qtp-hit、Enter 导航 .qtp-hit-cur、Esc 内建清空恢复', async () => {
    const { host } = mountTree({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }] } } });
    await settle();
    const inp = host.querySelector('.qtp-find input') as HTMLInputElement;
    inp.value = 'a';
    inp.dispatchEvent(new Event('input'));
    await settle();
    expect(host.querySelector('.cn.qtp-hit'), '命中行柔底高亮在场').toBeTruthy();
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(host.querySelector('.cn.qtp-hit-cur'), 'Enter 导航落当前命中加重档（@enter 接线验证）').toBeTruthy();
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(inp.value, 'Esc 内建清空（SearchFilterBar 承接，三处同行为）').toBe('');
    expect(host.querySelector('.cn.qtp-hit'), '清空后高亮恢复').toBeNull();
  });
});
