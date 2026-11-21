import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import HotkeyPanel from '../../components/HotkeyPanel.vue';
import { GOTO_TARGETS } from '../hotkeys';
import { NAV_ITEMS } from '../../router';

/* R93-13：速查面板 ↔ 真实 goto 绑定的双向一致性看守。
 *
 * 背景：Task 13 退役 OpsView/HistoryView 时删了 GOTO_MAP 的 p/h，
 * 但 HotkeyPanel 里是一张硬编码字符串表，没跟着改——vue-tsc 与全部单测都抓不到，
 * 面板于是宣传两个已不存在的绑定（g,p 静默无反应；g,h 穿透到 NAV 的 h→/workspace，
 * 说去「历史」实际去工作台）。App.vue 的注释还自认这是手工同步点。
 *
 * 判据取值的两侧必须**互相独立**，否则断言恒真：
 *   一侧 = 面板真实渲染出的 DOM 文本里解析出的字母集合；
 *   另一侧 = 真按下 g+字母后**路由实际落到哪**（行为观测，不是回读 GOTO_TARGETS）。
 * 早期版本两侧都读 GOTO_TARGETS，结果「从表里删掉一个字母」这种改动测试照样绿——
 * 因为删除同时抽掉了两侧的数据。改成行为观测后该场景才会红。
 *
 * 双向：
 *   真实→面板：凡 g+字母能真跳走的，都必须在面板里被宣传（否则「有功能没人知道」）
 *   面板→真实：面板宣传的每个字母都必须真能跳到它宣称的目标（否则「撒谎的界面」）
 *
 * 项目无 @vue/test-utils 且硬约束零新增依赖，故用 createApp 手工挂载。 */

/* ── 侧 A：面板渲染结果（DOM 文本解析） ────────────────────────────── */

async function renderPanelRows(): Promise<string[]> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(HotkeyPanel, { show: true }) });
  app.use(pinia);
  app.mount(host);
  await nextTick();
  // 逐行取 .hk-desc：整页 textContent 会把相邻行首尾粘连（"a分词验证" 紧接 "g 字母"）
  const rows = [...document.querySelectorAll('.hk-desc')].map(el => el.textContent ?? '');
  app.unmount();
  host.remove();
  return rows;
}

/** 解析面板宣传的「字母 → 标签」。条目以「·」分隔：label 自身可能含空格
 *  （"REST 直连"/"Watcher 告警"），拿空格当边界会断错词。 */
function parseAdvertised(rows: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    const chord = /^(.*?)（vim/.exec(row);           // gg chord 行，无字母前缀
    if (chord) { out.set('g', chord[1].trim()); continue; }
    const m = /^(?:Vim 风 goto|续表)：(.*)$/.exec(row);
    if (!m) continue;
    for (const item of m[1].split('·')) {
      const s = item.trim();
      if (s) out.set(s.slice(0, 1), s.slice(1));
    }
  }
  return out;
}

/* ── 侧 B：真实键盘行为（观测路由落点） ────────────────────────────── */

/* App.vue onKey 的 chord 分支等价实现。此处刻意**不**回读 GOTO_TARGETS 做断言，
   而是把它当作「被测系统」：按键 → 查表 → router.push，观测最终落点。
   NAV 单键回退分支一并复刻，g,h 这类「GOTO 无登记但 NAV 有同名单键」的穿透
   才能如实暴露出来。 */
function installChordHandler(router: { push: (p: string) => unknown }, map: Record<string, string>) {
  let gWait = 0;
  const onKey = (e: KeyboardEvent) => {
    if (Date.now() < gWait) {
      gWait = 0;
      const target = map[e.key.toLowerCase()];
      if (target) { router.push(target); return; }
      // 落到 NAV 单键回退（App.vue 的真实行为）
    }
    if (e.key === 'g') { gWait = Date.now() + 1500; return; }
    const item = NAV_ITEMS.find(n => n.key === e.key);
    if (item) router.push(item.path);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    // 通配路由：只观测落点，不加载真实视图组件
    routes: [{ path: '/:all(.*)', component: { template: '<div/>' } }],
  });
}

/** 真按 g + letter，返回路由实际落点；没跳走则 null。 */
async function pressGoto(letter: string): Promise<string | null> {
  const router = makeRouter();
  await router.push('/__start__');
  await router.isReady();

  const { GOTO_MAP } = await import('../hotkeys');
  const teardown = installChordHandler(router, { ...GOTO_MAP });

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: letter }));
  // router.push 是异步的：nextTick 不够，要等导航真正结算
  await new Promise(r => setTimeout(r, 0));
  await router.isReady();
  await nextTick();

  teardown();
  const landed = router.currentRoute.value.fullPath;
  return landed === '/__start__' ? null : landed;
}

/** 扫 a-z，返回「g+字母 真能跳走」的字母 → 落点。这是独立于面板的真实绑定清单。 */
async function observeRealBindings(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const landed = await pressGoto(letter);
    if (landed) out.set(letter, landed);
  }
  return out;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('R93-13 快捷键速查面板与真实 goto 绑定的双向一致性', () => {
  it('自检：面板解析非空、行为观测非空（任一恒空都会让双向断言恒真）', async () => {
    const advertised = parseAdvertised(await renderPanelRows());
    const real = await observeRealBindings();
    expect(advertised.size).toBeGreaterThan(0);
    expect(real.size).toBeGreaterThan(0);
  });

  it('真实→面板：凡 g+字母能真跳走的，都必须在面板中被宣传', async () => {
    const advertised = parseAdvertised(await renderPanelRows());
    const real = await observeRealBindings();
    const missing = [...real.keys()].filter(k => !advertised.has(k)).sort();
    expect(missing).toEqual([]);
  });

  it('面板→真实：面板宣传的每个字母都必须真能跳走', async () => {
    const advertised = parseAdvertised(await renderPanelRows());
    const real = await observeRealBindings();
    const bogus = [...advertised.keys()].filter(k => !real.has(k)).sort();
    expect(bogus).toEqual([]);
  });

  it('双向等价：宣传字母集合与真实可跳转字母集合逐字母相等', async () => {
    const advertised = [...parseAdvertised(await renderPanelRows()).keys()].sort();
    const real = [...(await observeRealBindings()).keys()].sort();
    expect(advertised).toEqual(real);
  });

  it('面板宣传的标签与该字母真实落点的 NAV 名称一致（不能说去 A 实际去 B）', async () => {
    const advertised = parseAdvertised(await renderPanelRows());
    const real = await observeRealBindings();
    const lies: string[] = [];
    for (const [letter, label] of advertised) {
      const landed = real.get(letter);
      if (!landed) continue;                        // 已由「面板→真实」方向覆盖
      const nav = NAV_ITEMS.find(n => n.path === landed.split('?')[0]);
      const actual = nav?.name;
      // 带 query 的模式入口（s→/search?mode=sandbox）无独立 NAV 名，只要求落点可路由
      if (landed.includes('?')) { if (!nav) lies.push(`${letter}: 落点 ${landed} 无对应 NAV`); continue; }
      if (actual !== label) lies.push(`${letter}: 面板写 '${label}'，实际落到 ${landed}（'${actual}'）`);
    }
    expect(lies).toEqual([]);
  });

  it('每个 goto 目标都指向真实存在的路径（不是已退役 view 的死链）', () => {
    const dead: string[] = [];
    for (const [letter, target] of Object.entries(GOTO_TARGETS)) {
      const base = target.path.split('?')[0];
      if (!NAV_ITEMS.some(n => n.path === base)) dead.push(`${letter} -> ${target.path}`);
    }
    expect(dead).toEqual([]);
  });
});
