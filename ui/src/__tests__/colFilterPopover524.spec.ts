/**
 * 五百二十四批：五份同构筛选弹层合并共享 ColFilterPopover（qfp/rfp/bw-fp/pl-afp/afp → cfp 一处壳）。
 * 锁定：
 * 1) 组件契约：头文案「筛选「列」」、清除钮（clear+close 双 emit）、值内搜索（update:kw +
 *    MarkText 命中切 mark）、每值计数、mini-bar（bars）、基数降级提示、区间双输入（set-range）、
 *    Esc/点遮罩 close、默认插槽（Browser 复制整列值底栏位）；
 * 2) 消费端最终 DOM（QRT + BrowserView 挂载）——保命挂载锁：类名与交互锚点逐字；
 * 3) z 层级：mask=var(--z-ctx)、面板=calc(var(--z-ctx) + 1)（.float-pop 自带 --z-island
 *    浮岛档，被局部覆写压回 ctx 档）；CellContextMenu 单独使用 --z-ctx-top 顶档。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('vue-router', () => ({ useRouter: () => undefined, useRoute: () => ({ path: '/browser', query: {} }) }));

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

import ColFilterPopover from '../components/ColFilterPopover.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import BrowserView from '../views/BrowserView.vue';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function tick(n = 8) { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } }

beforeEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

/* ═══ ① 组件契约 ═══ */
describe('ColFilterPopover 组件契约（五百二十四批）', () => {
  type Rec = Record<string, any[]>;
  async function mountCfp(extra: Record<string, any> = {}, slot?: () => any) {
    const events: Rec = {};
    const rec = (k: string) => (...args: any[]) => { (events[k] ??= []).push(args); };
    const kw = ref('');
    /* 同容器重复 mount 会顶替前一个 app（共享 renderer 的 container vnode）——契约挂载各用独立 host */
    const cfpHost = document.createElement('div');
    document.body.appendChild(cfpHost);
    const app = createApp({
      setup: () => () => h(ColFilterPopover as any, {
        col: 'name', x: 12, y: 20,
        vals: [{ v: 'banana', n: 2 }, { v: 'apple', n: 1 }],
        total: 3, hasMore: true, showHasMore: true,
        selected: ['banana'], normOf: (v: any) => String(v),
        labelOf: (v: any) => String(v),
        search: true, kw: kw.value, 'onUpdate:kw': (v: string) => { kw.value = v; rec('update:kw')(v); },
        bars: true,
        onClose: rec('close'), onClear: rec('clear'), onToggle: rec('toggle'), onSetRange: rec('set-range'),
        ...extra,
      }, slot ? { default: slot } : undefined),
    });
    app.mount(cfpHost);
    apps.push(app);
    await tick(4);
    return { events, kw };
  }

  it('头文案/清除钮/计数/mini-bar/降级提示/勾选态逐字', async () => {
    const { events } = await mountCfp();
    const pop = document.querySelector('.cfp')!;
    expect(pop, '弹层应挂载（teleport body）').not.toBeNull();
    expect(pop.getAttribute('role')).toBe('dialog');
    expect(pop.getAttribute('aria-label')).toBe('筛选 name 列');
    expect(pop.querySelector('.cfp-hd')!.textContent).toContain('筛选「name」');
    const ns = [...pop.querySelectorAll('.cfp-n')].map(s => s.textContent?.trim());
    expect(ns).toEqual(['2', '1']);
    expect(pop.querySelectorAll('.cfp-barw').length, 'bars 开时应出值分布 mini-bar').toBe(2);
    expect(pop.querySelector('.cfp-barw .cfp-bar')!.getAttribute('style')).toContain('100%');
    expect(pop.textContent).toContain('仅显示前 2 个高频值——用上方搜索缩小范围');
    /* 勾选态：selected=['banana']（normOf 归一后比对） */
    const boxes = [...pop.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
    /* 点击未勾值 → toggle emit 载荷=原始值 */
    boxes[1].click();
    await tick(2);
    expect(events['toggle']).toEqual([['apple']]);
    /* 清除钮：clear + close 双 emit */
    (pop.querySelector('.cfp-clear') as HTMLButtonElement).click();
    await tick(2);
    expect(events['clear']?.length).toBe(1);
    expect(events['close']?.length).toBe(1);
  });

  it('值内搜索：输入 emit update:kw，kw 命中段经 MarkText 切 mark', async () => {
    const state = await mountCfp();
    const kwInp = document.querySelector('.cfp .cfp-kw') as HTMLInputElement;
    expect(kwInp.placeholder).toBe('搜索值（共 3 个不同值）…');
    kwInp.value = 'an';
    kwInp.dispatchEvent(new Event('input', { bubbles: true }));
    await tick(2);
    expect(state.events['update:kw']).toEqual([['an']]);
    /* 父层把 kw 回灌（真实管线 filterVals 收窄在 useColFilters，已有回归锁）；
       此处验证壳的渲染半边：kw='an' 时 banana 命中段切 mark、apple 不切（独立 host 防顶替） */
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    const app2 = createApp({
      setup: () => () => h(ColFilterPopover as any, {
        col: 'name', x: 0, y: 0,
        vals: [{ v: 'banana', n: 2 }, { v: 'apple', n: 1 }],
        total: 2, selected: [], normOf: (v: any) => String(v), labelOf: (v: any) => String(v),
        search: true, kw: 'an', bars: false,
      }),
    });
    app2.mount(host2);
    apps.push(app2);
    await tick(4);
    const pops = [...document.querySelectorAll('.cfp')];
    const rows = pops[1].querySelectorAll('.cfp-row');
    expect(rows[0].querySelectorAll('mark').length, 'banana 含两段 an 命中').toBe(2);
    expect(rows[1].querySelectorAll('mark').length, 'apple 无命中不出 mark').toBe(0);
    /* 无匹配值空态 */
    const host3 = document.createElement('div');
    document.body.appendChild(host3);
    const app3 = createApp({
      setup: () => () => h(ColFilterPopover as any, {
        col: 'name', x: 0, y: 0, vals: [], total: 5,
        selected: [], normOf: (v: any) => String(v), search: true, kw: 'zz',
      }),
    });
    app3.mount(host3);
    apps.push(app3);
    await tick(4);
    expect([...document.querySelectorAll('.cfp')][2].textContent).toContain('无匹配值');
  });

  it('Esc（面板/遮罩）与点遮罩 emit close；区间双输入 emit set-range；插槽渲染底栏', async () => {
    const { events } = await mountCfp(
      { range: true, rangeMin: '', rangeMax: '', rangeMinPh: '最小值（含）', rangeMaxPh: '最大值（含）' },
      () => h('button', { class: 'btn ghost xs' }, '复制整列值'),
    );
    const pop = document.querySelector('.cfp')!;
    pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(2);
    /* 五百六十八批同步更新：Esc 升 document 捕获级单源（colFilterPopoverEsc568）——原五壳
       「面板+遮罩双 esc 冒泡 close=2」语义退役，capture 级 stopPropagation 单次 close=1 */
    expect(events['close']?.length, '面板 Esc → close（document 捕获级单源）').toBe(1);
    const mask = document.querySelector('.cfp-mask') as HTMLElement;
    mask.dispatchEvent(new Event('click', { bubbles: true }));
    await tick(2);
    expect(events['close']?.length, '遮罩 click → close').toBe(2);
    /* 区间双输入（aria=「列名 最小/最大值（含）」，与原 afp/qfp/rfp 语义一致） */
    const ins = [...document.querySelectorAll('.cfp .cfp-range-in')] as HTMLInputElement[];
    expect(ins.length).toBe(2);
    expect(ins[0].getAttribute('aria-label')).toBe('name 最小值（含）');
    ins[0].value = '3';
    ins[0].dispatchEvent(new Event('input', { bubbles: true }));
    await tick(2);
    expect(events['set-range']).toEqual([['min', '3']]);
    /* 默认插槽（Browser「复制整列值」底栏位）渲染进 .cfp-acts */
    expect(document.querySelector('.cfp .cfp-acts')!.textContent).toContain('复制整列值');
  });
});

/* ═══ ② 消费端最终 DOM（QRT + Browser）——保命挂载锁 ═══ */
const QRT_HITS = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
  { _id: 'c', _source: { name: 'cherry', age: 1 } },
] as any;

async function mountQrt() {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, { hits: QRT_HITS, storageKey: 'cfp524' }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick(10);
}

const INDICES = [
  { index: 'logs-green', health: 'green', status: 'open', 'docs.count': 10, 'store.size': '1mb', pri: 1, rep: 1, 'creation.date.string': '2024-01-01' },
  { index: 'logs-yellow', health: 'yellow', status: 'open', 'docs.count': 5, 'store.size': '2mb', pri: 1, rep: 1, 'creation.date.string': '2024-02-01' },
  { index: 'logs-red', health: 'red', status: 'open', 'docs.count': 1, 'store.size': '3mb', pri: 1, rep: 1, 'creation.date.string': '2024-03-01' },
] as any[];

async function mountBrowser() {
  const app = createApp({
    setup: () => {
      const store = useAppStore();
      store.indices = INDICES; /* 直接种数据免 api（有数据时 onMounted 不再 loadIndices） */
      return () => h(BrowserView as any);
    },
  });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick(10);
}

describe('消费端最终 DOM（五百二十四批保命挂载锁）', () => {
  it('QRT：漏斗 → 共享壳挂载，类名/交互锚点逐字（hd/kw/barw/val/n/clear），勾选过滤闭环', async () => {
    await mountQrt();
    const funnel = [...host.querySelectorAll('thead th .qrt-funnel')]
      .find(b => b.getAttribute('aria-label') === '筛选 name 列') as HTMLButtonElement;
    funnel.click();
    await tick(4);
    const pop = document.querySelector('.cfp')!;
    expect(pop, '点击漏斗应弹出共享筛选层').not.toBeNull();
    expect(pop.classList.contains('float-pop'), '面板基座挂全局 .float-pop').toBe(true);
    expect(pop.querySelector('.cfp-hd')!.textContent).toContain('筛选「name」');
    expect(document.querySelector('.cfp-mask')).not.toBeNull();
    expect(pop.querySelector('.cfp-kw'), 'QRT 通道带值内搜索').not.toBeNull();
    expect(pop.querySelectorAll('.cfp-barw').length, 'QRT 通道带 mini-bar').toBe(3);
    const vals = [...pop.querySelectorAll('.cfp-val')].map(s => s.textContent?.trim());
    expect(vals).toEqual(['banana', 'apple', 'cherry']);
    /* 勾 banana → 行过滤 + 漏斗高亮（useColFilters 管线零改动的行为闭环） */
    (pop.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement).click();
    await tick(6);
    const rows = [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'));
    expect(rows.length).toBe(1);
    expect(funnel.classList.contains('on')).toBe(true);
    /* 遮罩关闭 → 共享壳卸载 */
    document.querySelector('.cfp-mask')!.dispatchEvent(new Event('click', { bubbles: true }));
    await tick(2);
    expect(document.querySelector('.cfp')).toBeNull();
  });

  it('Browser：health 漏斗 → 共享壳（529 反转同步更新：换 QRT rows 型后走 QRT 通道形态——带值内搜索/mini-bar），勾选过滤+暗状态提示', async () => {
    await mountBrowser();
    /* 五百二十九批锚同步更新：.bw-f-btn 视图宿主钮 → QRT 内建 .qrt-funnel（aria 同字） */
    const funnel = host.querySelector('.qrt-funnel') as HTMLButtonElement;
    expect(funnel.getAttribute('aria-label')).toBe('筛选 健康 列');
    funnel.click();
    await tick(4);
    const pop = document.querySelector('.cfp')!;
    expect(pop, '点击漏斗应弹出共享筛选层').not.toBeNull();
    /* 五百二十九批锚同步更新：筛选「health」→ 筛选「健康」（列名改中文键） */
    expect(pop.querySelector('.cfp-hd')!.textContent).toContain('筛选「健康」');
    /* QRT 通道带值内搜索 + mini-bar（内核统一形态；旧 Browser 宿主壳的无搜索/无 mini-bar
       零增量形态随换壳退役） */
    expect(pop.querySelector('.cfp-kw'), 'QRT 通道带值内搜索').not.toBeNull();
    expect(pop.querySelectorAll('.cfp-barw').length, 'QRT 通道带 mini-bar').toBeGreaterThan(0);
    /* 勾 green → 表格只剩 green 行 + QRT 工具行「已筛选 1 列」（旧 .bw-flt-on 随壳退役） */
    const boxes = [...pop.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    boxes[0].click();
    await tick(6);
    const rows = [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'));
    expect(rows.length).toBe(1);
    expect(rows[0]!.textContent).toContain('logs-green');
    expect(funnel.classList.contains('on')).toBe(true);
    expect(host.querySelector('.qrt-filtered')!.textContent).toContain('已筛选 1 列');
    /* 遮罩关闭 → 共享壳卸载 */
    document.querySelector('.cfp-mask')!.dispatchEvent(new Event('click', { bubbles: true }));
    await tick(2);
  });

  it('Browser：Esc 关共享壳后表格恢复全行（关闭卸载闭环）', async () => {
    await mountBrowser();
    (host.querySelector('.qrt-funnel') as HTMLButtonElement).click();
    await tick(4);
    const mask = document.querySelector('.cfp-mask') as HTMLElement;
    mask.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(2);
    expect(document.querySelector('.cfp')).toBeNull();
    const rows = [...host.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('qrt-nomatch'));
    expect(rows.length).toBe(3);
  });
});

/* ═══ ③ z 层级（mask=ctx 档、面板=ctx+1；float-pop 的 island 档被局部覆写压回） ═══ */
describe('z 层级收口（五百二十四批）', () => {
  const src = readFileSync(join(__dirname, '../components/ColFilterPopover.vue'), 'utf-8');
  const css = src.split('<style scoped>')[1] ?? '';

  it('共享壳：mask 走 var(--z-ctx)，面板 calc(var(--z-ctx) + 1) 压回 ctx 档（不升 --z-island）', () => {
    expect(css).toMatch(/\.cfp-mask \{ position: fixed; inset: 0; z-index: var\(--z-ctx\); \}/);
    expect(css).toMatch(/\.cfp \{\s*z-index: calc\(var\(--z-ctx\) \+ 1\);/);
    expect(css, '壳内不得再出现 12xx 字面量').not.toMatch(/z-index:\s*120[01]/);
  });

  it('锁内六文件 z 字面量全部收口（CellContextMenu 与五处消费端旧壳删除后无残留）', () => {
    for (const f of [
      '../components/CellContextMenu.vue',
      '../components/QueryResultTable.vue',
      '../components/ResultTable.vue',
      '../views/BrowserView.vue',
      '../views/PluginsView.vue',
      '../views/SecurityView.vue',
    ]) {
      const s = readFileSync(join(__dirname, f), 'utf-8');
      expect(s, f + ' 不应再有 z-index:1200/1201 字面量').not.toMatch(/z-index:\s*120[01]/);
    }
    /* 右键菜单独立顶档：必须压过 Picker 浮岛（--z-island）/全屏——旧 ctx 档 1200 会
       在字段候选浮层里被盖住（真实浏览器实测） */
    const ccm = readFileSync(join(__dirname, '../components/CellContextMenu.vue'), 'utf-8');
    expect(ccm).toMatch(/\.ccm-mask \{ position: fixed; inset: 0; z-index: var\(--z-ctx-top\); \}/);
    expect(ccm).toMatch(/z-index: calc\(var\(--z-ctx-top\) \+ 1\);/);
  });
});
