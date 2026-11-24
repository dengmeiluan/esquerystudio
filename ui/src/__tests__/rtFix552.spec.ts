/**
 * 五百五十二批（W2）：ResultTable 两件用户实报修复。
 *
 * ① 回顶钮遮挡状态栏——.rt-backtop（absolute right:18 bottom:16）此前锚 .rt 根（整卡），
 *    压住流内最后一行 .rt-status（margin-top sp-2，右端「转置/单行自动」checkbox）。
 *    根治=定位锚点下移到滚动视口壳：新增 .rt-wrap-shell（position:relative; flex:1;
 *    min-height:0; display:flex）包住 .rt-wrap（.rt-wrap 是滚动容器，absolute 子级随滚，
 *    不能直接做定位壳），TableBacktop 移入壳内（rt-wrap 之后兄弟），类名与 right/bottom
 *    值不动=视觉零变。行为锁 backTop258（scroll>600 显隐+点击归顶）零触。
 *    QRT 同病核实=是：.qrt 同为 position:relative 整卡锚，qrt-pgr 分页行（525 批）卡底
 *    右对齐，同被盖——同修（qrt-wrap-shell 最小形态 position:relative，QRT 根非 flex 布局
 *    不套 RT 的 flex 规格，三分支 loading/empty/wrap 链随壳包入保 v-else-if 相邻）。
 * ② 放大（⤢聚焦面）后切 Tree/JSON 视图主体空白——Tree/JSON 内容是宿主（DslQueryView）
 *    里 RT 的兄弟节点，FS fs-active（fixed inset 不透明覆盖层）之下不可见，面内只剩
 *    rt-bar 全屏白。根治=RT 内建 watch：hideBody false→true 且聚焦中 → 自动退出聚焦
 *    （与 Esc 退出同语义；541 批「聚焦态可切视图」备案修订：聚焦态仅表格）。FS 零改动；
 *    RT expose 无 focused（1862 行），行为锁走 FS 联动单测（fs-active/data-focused-pane）。
 *
 * 挂载样板照抄 tableKernelWave535/backTop258（裸 createApp + pinia；happy-dom 点击一律
 * dispatchEvent；reactive pstate 动态改 prop 同 queryTablePrefs:216 先例）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import ResultTable from '../components/ResultTable.vue';
import QueryResultTable from '../components/QueryResultTable.vue';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

const HITS = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountComp(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}

/* 从 openIdx 起做 <div> 开闭平衡扫描，返回配对 </div> 的下标（模板序断言用） */
function closeDivIdx(src: string, openIdx: number): number {
  const re = /<div\b|<\/div>/g;
  re.lastIndex = openIdx;
  let depth = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return m.index;
  }
  return -1;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.style.overflow = '';
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

/* ═══════════ ① rt-wrap-shell 定位壳 + TableBacktop 在壳内（RT） ═══════════ */
describe('五百五十二批 ①：rt-wrap-shell 定位壳（回顶锚点下移，状态栏不再被盖）', () => {
  it('RT 源码锁：壳在场+模板序（壳开标签→rt-wrap→TableBacktop→壳闭标签）+状态栏留壳后流内', () => {
    const shellAt = rt.indexOf('<div class="rt-wrap-shell">');
    /* 六百零九批同步更新：守卫字面 !hideBody→!bodyHidden（内核 viewSeg 内建档切换共用同一
       隐藏判定=hideBody ∪ 内建非表格档；判别力不变=结构锚逐字保全） */
    const wrapAt = rt.indexOf('<div v-show="!bodyHidden" ref="wrapEl" class="rt-wrap scroll-y"');
    const backtopAt = rt.indexOf('<TableBacktop v-if="showTop" class="rt-backtop"');
    const statusAt = rt.indexOf('<div class="rt-status"');
    expect(shellAt, '定位壳在场').toBeGreaterThan(-1);
    expect(wrapAt, '防空跑：rt-wrap 开标签在场').toBeGreaterThan(-1);
    expect(backtopAt, '防空跑：TableBacktop 在场').toBeGreaterThan(-1);
    expect(wrapAt, 'rt-wrap 开标签在壳开标签之后').toBeGreaterThan(shellAt);
    expect(backtopAt, 'rt-wrap 开标签先于 TableBacktop').toBeGreaterThan(wrapAt);
    const shellClose = closeDivIdx(rt, shellAt);
    expect(shellClose, '壳有配对闭标签').toBeGreaterThan(backtopAt);
    expect(statusAt, 'rt-status 状态栏在壳闭标签之后（流内尾行，不被壳吃掉）').toBeGreaterThan(shellClose);
  });

  it('RT CSS 锁：壳=relative+min-height:240px+flex 布局（1365 回 flex:1 1 auto，见 rtAutoFit562）；rt-wrap 补 min-width:0；backtop 仍 right/bottom 锚值', () => {
    /* 562 → 1355 → 1365 的三次修订见 rtAutoFit562.spec.ts 注释：底纹（1359b）已经把
       原来那块「死白」变成网格延续，所以 1365 把 flex-grow 放回 1（.rt 内不再有
       96px 无子元素占用的空洞）。定位壳语义、回顶锚值、状态栏流内位置全部不变。 */
    expect(rt).toMatch(/\.rt-wrap-shell \{ position: relative; flex: 1 1 auto; min-height: 240px; display: flex; \}/);
    expect(rt).toMatch(/\.rt-wrap \{ flex: 1; min-width: 0; overflow: auto;/);
    expect(rt).toMatch(/\.rt-backtop \{[^}]*right: 18px; bottom: 16px;/);
  });

  it('RT 挂载形态：壳包住 rt-wrap；滚出回顶钮后它是壳直接子级（锚点=视口底）', async () => {
    await mountComp(ResultTable, { hits: HITS, total: 2, index: 'rt552s', storageKey: 'rt552s' });
    const shell = host.querySelector('.rt-wrap-shell') as HTMLElement;
    expect(shell, '壳在场').toBeTruthy();
    expect(shell.querySelector('.rt-wrap'), 'rt-wrap 在壳内').toBeTruthy();
    const wrap = host.querySelector('.rt-wrap') as HTMLElement;
    wrap.scrollTop = 900;
    wrap.dispatchEvent(new Event('scroll', { bubbles: true }));
    await tick(4);
    const btn = [...shell.children].find(c => c.classList.contains('rt-backtop')) as HTMLElement | undefined;
    expect(btn, '滚过 600px 后回顶钮是壳直接子级（同一壳）').toBeTruthy();
  });
});

/* ═══════════ ② hideBody watch 自动退出聚焦（RT，FS 联动行为锁） ═══════════ */
describe('五百五十二批 ②：hideBody false→true 自动退出聚焦（放大后切 JSON/Tree 不再全屏白）', () => {
  it('源码锁：watch(bodyHidden) + focused.value = false（与 Esc 退出同语义）', () => {
    /* 六百零九批同步更新：watch 源升 bodyHidden（hideBody ∪ 内建 viewSeg 非表格档——内建档
       切换同样退聚焦；viewSeg=false 时源≡hideBody 行为等值零回归，QRT 607 同款对称） */
    expect(rt).toMatch(/watch\(bodyHidden/);
    expect(rt).toMatch(/focused\.value = false/);
  });

  it('FS 联动行为锁：点放大钮入聚焦（fs-active）→ hideBody 置 true 自动退出（RT expose 无 focused，走 fs-active/data-focused-pane 断言）', async () => {
    const p = reactive({ hits: HITS, total: 2, index: 'rt552f', storageKey: 'rt552f', hideBody: false });
    await mountComp(ResultTable, p);
    const fsRoot = () => host.querySelector('.fs') as HTMLElement | null;
    expect(fsRoot()?.classList.contains('fs-active'), '初始未聚焦').toBe(false);
    const zoomBtn = [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '放大结果表') as HTMLButtonElement;
    expect(zoomBtn, '放大钮在场（focusable 缺省开）').toBeTruthy();
    zoomBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick(4);
    expect(fsRoot()?.classList.contains('fs-active'), '点击放大 → 聚焦态').toBe(true);
    expect(fsRoot()?.getAttribute('data-focused-pane'), '聚焦面 pane 标识=rt.table').toBe('rt.table');
    p.hideBody = true;
    await tick(4);
    expect(fsRoot()?.classList.contains('fs-active'), 'hideBody=false→true 且聚焦中 → 自动退出聚焦（552 修法）').toBe(false);
    expect(fsRoot()?.getAttribute('data-focused-pane'), 'data-focused-pane 同步清空').toBeNull();
  });
});

/* ═══════════ ④ QRT 同病同修（qrt-pgr 分页行遮挡） ═══════════ */
describe('五百五十二批 ④：QRT 同病同修（backtop 整卡锚盖住 qrt-pgr 分页行右端）', () => {
  it('QRT 源码锁：壳在场+三分支链随壳（保 v-else-if 相邻）+backtop 在壳内+qrt-pgr 留壳后流内', () => {
    const shellAt = qrt.indexOf('<div class="qrt-wrap-shell">');
    /* 六百零七批同步更新：守卫字面 !hideBody→!bodyHidden（内核 viewSeg 内建档切换共用同一
       隐藏判定=hideBody ∪ 内建非表格档；判别力不变=结构锚逐字保全） */
    const chainAt = qrt.indexOf('<template v-if="loading && !bodyHidden">');
    const wrapAt = qrt.indexOf('<div v-else v-show="!bodyHidden" ref="wrapRef" class="qrt-wrap"');
    const backtopAt = qrt.indexOf('<TableBacktop v-if="showTop && !bodyHidden" class="rt-backtop qrt-backtop"');
    const pgrAt = qrt.indexOf('<div v-if="pagerOn && ((!loading && !isEmpty) || bodyHidden)" class="qrt-pgr">');
    expect(shellAt, '定位壳在场').toBeGreaterThan(-1);
    expect(chainAt, '防空跑：loading 分支在场').toBeGreaterThan(-1);
    expect(wrapAt, '防空跑：qrt-wrap 分支在场').toBeGreaterThan(-1);
    expect(backtopAt, '防空跑：TableBacktop 在场').toBeGreaterThan(-1);
    expect(pgrAt, '防空跑：qrt-pgr 分页行在场').toBeGreaterThan(-1);
    expect(chainAt, 'loading/empty/wrap 三分支随壳包入（v-else-if 相邻不破）').toBeGreaterThan(shellAt);
    expect(wrapAt).toBeGreaterThan(chainAt);
    expect(backtopAt, 'TableBacktop 在壳内（rt-wrap 之后）').toBeGreaterThan(wrapAt);
    const shellClose = closeDivIdx(qrt, shellAt);
    expect(shellClose).toBeGreaterThan(backtopAt);
    expect(pgrAt, 'qrt-pgr 分页行在壳闭标签之后（流内尾行）').toBeGreaterThan(shellClose);
  });

  it('QRT CSS 锁：壳最小形态（QRT 根非 flex）；qrt-backtop 仍 right/bottom 锚值', () => {
    expect(qrt).toMatch(/\.qrt-wrap-shell \{ position: relative; \}/);
    expect(qrt).toMatch(/\.qrt-backtop \{[^}]*right: 18px; bottom: 16px;/);
  });
});
