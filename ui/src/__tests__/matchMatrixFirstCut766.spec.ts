/**
 * 七百六十六批：MatchMatrix 首刀三刀（R146；⑥765 头号建议落地=R145 裁决表
 * G232+G234+G235；741 G148/743 G152/745/747/749/751/753/755/757/760/762/764
 * 首刀族同构；本页首例真挂载首刀后 spec——matchMatrixSort 同源挂载/mock 形态：
 * 视图/组件全真，只 mock ../api 出口+JsonArea（Monaco）边界 stub；hash 深链 ?idx=）。
 *
 * ① G232（P3 死代码·头号）mm- 四死规则=页头三伴（PageHeader 合并漏删——源内
 *    「第十批」注释自证删 -hd-tt/-hd-sub 而三伴漏删）+ .mm-ii（IndexPicker 退役
 *    伴漏删+注释宣称已删规则仍在=764 .as-ii 同款再演，713 G53/715 G56/717 G61/
 *    721 G72/727 G86/729 G94/737 G131/741 G147/761 G220 同族）——修法=纯删零连锁；
 *    .mm-hd 基础规则与 @media 900 档活规则不动；scoped 规则 23→19 恰减四
 *    （765 盘点备案口径=「.mm-」前缀规则块数）。
 * ② G234（P3 铁律 D·次刀）跑矩阵/重试钮 busy 无 spinning 无在途文案（busy 行
 *    「查询中…」+disabled 在场=半合规；746 G161/750 G185/721 G73 族）——修法=
 *    Loader2 v-if busy + Play v-else 双态+「查询中…」在途文案（AdhocRebuildView
 *    启动钮同构）。⚠重试钮在 err-bar 面板内、run() 起手清 runErr→面板随 busy
 *    卸载，其 busy 态挂载不可观测——重试钮走源码对称双态（源码锁锚），挂载在途
 *    断言只锚常驻的跑矩阵钮。
 * ③ G235（弱 P3 aria·随批可裁）.mm-stats 容器无 role/aria（757 G210/761 G224/
 *    764 G229 族）——修法=role=group+中文 aria-label。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/MatchMatrixView.vue'), 'utf-8');

const HITS = [
  { _id: 'doc-a', _score: 1.5, matched_queries: ['title-match', 'recent-1y'] },
  { _id: 'doc-b', _score: 3.0, matched_queries: ['recent-1y'] },
];

const searchRawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => []),
      searchRaw: (...a: any[]) => searchRawFn(...a),
    },
  };
});

/* JsonArea 内嵌 Monaco，happy-dom 起不来且与本契约无关（matchMatrixSort 同款） */
vi.mock('../components/JsonArea.vue', () => ({
  default: { name: 'JsonArea', props: ['modelValue'], template: '<div class="ja-stub" />' },
}));

import MatchMatrixView from '../views/MatchMatrixView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountMm() {
  location.hash = '#/match-matrix?idx=t1';
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:p(.*)*', component: MatchMatrixView }],
  });
  const app = createApp({ render: () => h(MatchMatrixView) });
  app.use(createPinia());
  app.use(router);
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

const runBtnOf = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('跑矩阵'));

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  location.hash = '';
  searchRawFn.mockReset().mockResolvedValue({ hits: { hits: HITS } });
});

describe('766 A0 挂载不变量负锚（现状即守卫，非刀面）', () => {
  it('页头三 action 钮+引导空态+run 钮 ?idx= 解禁+stats/表零渲染', async () => {
    const { app, host } = await mountMm();
    const btns = [...host.querySelectorAll<HTMLButtonElement>('button')].map(b => b.textContent || '');
    expect(btns.some(t => t.includes('自动命名'))).toBe(true);
    expect(btns.some(t => t.includes('去调参'))).toBe(true);
    const runBtn = runBtnOf(host);
    expect(runBtn, '跑矩阵钮必须渲染').toBeTruthy();
    expect(runBtn!.disabled, 'index 已由 ?idx=t1 注入，按钮可用').toBe(false);
    expect(host.textContent).toContain('写一个 bool 查询');
    expect(host.querySelectorAll('.mm-stat').length).toBe(0);
    expect(host.querySelectorAll('table tbody tr').length).toBe(0);
    app.unmount();
  });
});

describe('766 G232 四死规则整删（死代码·头号·PageHeader 合并漏删三伴+IndexPicker 退役伴漏删）', () => {
  it('源码锁：四死类 scoped 定义绝迹（模板本就零引用；-ic 负向锚收词界防误伤活类）', () => {
    expect(src, '页头三伴之一死规则须删').not.toMatch(/\.mm-hd-l\b/);
    expect(src, '页头三伴之二死规则须删（活类无 -ic 前缀冲突，词界锚）').not.toMatch(/\.mm-hd-ic\s*\{/);
    expect(src, '页头三伴之三死规则须删').not.toMatch(/\.mm-hd-r\b/);
    expect(src, 'IndexPicker 退役伴漏删死规则须删（注释宣称已删规则仍在=764 同款）').not.toMatch(/\.mm-ii\b/);
  });
  it('scoped 规则恰 19（765 盘点 23 恰减四）+ 活锚 .mm-hd/.mm-card/.mm-stats 在场', () => {
    const style = src.slice(src.indexOf('<style scoped>'), src.indexOf('</style>'));
    const mmRules = style.match(/^\.mm-[a-z0-9-]+[^{\n]*\{/gm) || [];
    expect(mmRules.length, '「.mm-」前缀规则块数（@media 嵌套行不计）').toBe(19);
    expect(src, '.mm-hd 基础活规则不动').toMatch(/^\.mm-hd \{/m);
    expect(src, '.mm-card 活规则不动').toMatch(/^\.mm-card \{/m);
    expect(src, '.mm-stats 活规则不动').toMatch(/^\.mm-stats \{/m);
  });
});

describe('766 G234 run/重试钮在途态（铁律 D·次刀·746 G161 spinning+在途文案族）', () => {
  it('挂载实锚：busy→跑矩阵钮 Loader2 spinning+「查询中…」+disabled；完成复常 Play+「跑矩阵」', async () => {
    let resolveRun!: (v: any) => void;
    searchRawFn.mockImplementation(() => new Promise(res => { resolveRun = res; }));
    const { app, host } = await mountMm();
    const runBtn = runBtnOf(host)!;
    runBtn.click();
    await settle(6);
    expect(runBtn.disabled, 'busy 期间禁用').toBe(true);
    expect(runBtn.textContent, '在途文案').toContain('查询中');
    expect(runBtn.querySelector('.spinning'), 'Loader2 spinning 图标在场').toBeTruthy();
    expect(runBtn.querySelector('.lucide-play-icon'), 'busy 期 Play 静态图标让位').toBe(null);
    resolveRun({ hits: { hits: HITS } });
    await settle(8);
    expect(runBtn.disabled, '完成复常解禁').toBe(false);
    expect(runBtn.textContent, '复常文案').toContain('跑矩阵');
    expect(runBtn.querySelector('.spinning'), 'spinning 移除').toBe(null);
    /* lucide-vue-next 本版本类名带 -icon 后缀（diag 实锚：lucide lucide-play-icon） */
    expect(runBtn.querySelector('.lucide-play-icon'), 'Play 图标复位').toBeTruthy();
    app.unmount();
  });
  it('健康面守卫：busy 行内 spinner 双通道并存（.mm-busy「查询中…」不随本刀移除）', async () => {
    let resolveRun!: (v: any) => void;
    searchRawFn.mockImplementation(() => new Promise(res => { resolveRun = res; }));
    const { app, host } = await mountMm();
    runBtnOf(host)!.click();
    await settle(6);
    const busyRow = host.querySelector('.mm-busy');
    expect(busyRow, 'busy 行在场（钮上反馈+行内反馈双通道）').toBeTruthy();
    expect(busyRow!.textContent).toContain('查询中');
    expect(busyRow!.querySelector('.spinning')).toBeTruthy();
    resolveRun({ hits: { hits: HITS } });
    await settle(8);
    expect(host.querySelector('.mm-busy'), '完成 busy 行移除').toBe(null);
    app.unmount();
  });
  it('源码锁：双钮 Loader2 v-if busy 双态形态在场（重试钮 busy 态随 err-bar 卸载不可观测——源码对称防未来面板保形漏配）', () => {
    expect(src, '跑矩阵钮双态（Loader2/Play 互换+在途文案）')
      .toMatch(/<Loader2 v-if="busy" :size="12" class="spinning" \/><Play v-else :size="12" \/> \{\{ busy \? '查询中…' : '跑矩阵' \}\}/);
    expect(src, '重试钮对称双态（Loader2+在途文案）')
      .toMatch(/<Loader2 v-if="busy" :size="12" class="spinning" \/>\{\{ busy \? '查询中…' : '重试' \}\}/);
  });
});

describe('766 G235 stats 容器 aria（弱 P3·随批可裁·757 G210/761 G224/764 G229 族）', () => {
  it('挂载实锚：跑出统计→.mm-stats role=group+中文 aria-label', async () => {
    const { app, host } = await mountMm();
    runBtnOf(host)!.click();
    await settle(8);
    const stats = host.querySelector('.mm-stats');
    expect(stats, '统计容器在场（main 桶两子句）').toBeTruthy();
    expect(stats!.getAttribute('role')).toBe('group');
    expect(stats!.getAttribute('aria-label')).toContain('子句命中统计');
    app.unmount();
  });
  it('空态守卫：无命中→.mm-stats 不渲染（v-if=clauseNames.length 不变量零改）', async () => {
    searchRawFn.mockResolvedValue({ hits: { hits: [] } });
    const { app, host } = await mountMm();
    runBtnOf(host)!.click();
    await settle(8);
    expect(host.querySelector('.mm-stats')).toBe(null);
    app.unmount();
  });
});

describe('1443 矩阵行宿主菜单（复制 _id/整行、去 X 光）', () => {
  it('源码锁：QRT 挂 row-action-group，组内三动作与权限无关（只读/导航）', () => {
    expect(src).toContain(':row-action-group="mmRowAction"');
    expect(src).toContain("label: '文档…'");
    expect(src).toContain("label: '复制 _id'");
    expect(src).toContain("label: '复制整行（含子句命中）'");
    expect(src).toContain("label: '在查询 X 光中分析'");
    expect(src).toContain('function mmRowAction');
    expect(src).toContain('gotoXray(id)');
  });

  it('行为：键盘聚焦行开单元格菜单，宿主组并入且二级三动作在场', async () => {
    const { app, host } = await mountMm();
    runBtnOf(host)!.click();
    await settle(10);
    const qrt = host.querySelector('.qrt') as HTMLElement;
    expect(qrt, 'QRT 已渲染').toBeTruthy();
    qrt.focus();
    qrt.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await settle(2);
    qrt.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    await settle(3);
    const menu = document.querySelector('.ccm') as HTMLElement;
    expect(menu, '菜单键开菜单').toBeTruthy();
    const parent = menu.querySelector('.ccm-it[data-key="mm-doc"]') as HTMLElement;
    expect(parent, '宿主行操作组父项').toBeTruthy();
    expect(parent.getAttribute('aria-haspopup')).toBe('menu');
    parent.dispatchEvent(new MouseEvent('mouseenter'));
    await settle(2);
    const labels = [...document.querySelectorAll('.ccm-sub .ccm-it')].map(b => (b.textContent || '').trim());
    expect(labels).toContain('复制 _id');
    expect(labels).toContain('复制整行（含子句命中）');
    expect(labels).toContain('在查询 X 光中分析');
    app.unmount();
  });
});
