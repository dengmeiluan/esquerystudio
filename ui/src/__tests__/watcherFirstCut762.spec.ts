/**
 * 七百六十二批：Watcher 首刀六小刀（R142；⑥761 头号建议落地=R141 裁决表
 * G220+G221+G222+G223+G224+G226；741 G148/743 G152/745/747/749/751/753/755/757/760
 * 首刀族同构；Watcher 首例真挂载 spec——视图/组件全真，只 mock ../api 出口）。
 *
 * ① G220（P3 死代码·头号）.wt-hd-l/-ic/-tt/-sub 四死规则（PageHeader 合并漏删族又一例，
 *    713 G53/715 G56/717 G61/721 G72/727 G86/729 G94/737 G131/741 G147 同族）——修法=四规则
 *    整删；.wt-hd 基础规则与 1100 堆叠档活规则不动（obsStack530 锁不受扰）。
 * ② G221（P3 注释失实·同批小刀）R42 §8.3 注释宣称「过滤词进 URL，刷新/分享后现场可复原」
 *    vs 实况 useScopedDraft 纯 sessionStorage（748 G176/754 G202/757 G207 同族第四例）——
 *    修法=注释诚实化一行，行为零改（本文件以「kw 不进 hash+草稿键落 sessionStorage」
 *    实锚真行为=注释新口径的守卫）。
 * ③ G222（P3 注释与实现不符·同批小刀）354 批源码注释+watcherFilterTrunc353.spec 行内注释
 *    双双宣称「computed 纯化、截断标志改由 watch 驱动」，实况 computed 内写
 *    filteredTruncated ref 的 side-effect 且全文件无 watch——修法=落真纯化：
 *    matchedWatches 同源派生，截断标志亦纯 computed（语义不变：无关键字=全量前 100，
 *    有关键字=过滤后前 100）；344/353 两 spec 源码锁同步更新。
 * ④ G223（P3 键盘可达·次刀）metadata popover 触发器裸 code 无 role/tabindex（G208 cd-chip 族）
 *    ——修法=role=button+tabindex=0+Enter 合成 click 走 n-popover trigger 包装层既有通道。
 * ⑤ G224（弱 P3 aria·随批可裁）.wt-list 容器无 role/aria-label（757 G210 族）——
 *    修法=role=group+aria-label=watch 清单。
 * ⑥ G226（弱 P3 铁律 F·随批可裁）MetaStrip 六段仅状态段有 tip——队列/已执行/失败三段
 *    补中文释义 tip（含 _watcher/stats 字段来源，G55/G60/G74/G112 同族升华格）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const src = readFileSync(join(__dirname, '../views/WatcherView.vue'), 'utf-8');

/* ---- 网络出口 mock：首刀族范式（视图/组件全真，只换出口） ---- */
const watcherListFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: { ...actual.api, watcherList: (...a: any[]) => watcherListFn(...a) },
  };
});

import WatcherView from '../views/WatcherView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/devtools', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(WatcherView as any) });
  apps.push(app);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  setActivePinia(pinia);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

/* main 桶：六 watch 全形态（761 probe mock 同源语义）+三节点混态 stats
   ——nodeCount=3/queue=2/executed=(100+80+20)+(60+60+20)=240/failed=3/state=started */
const LONG_META = JSON.stringify({ owner: 'ops-team', desc: 'x'.repeat(200) });
const STATS_762 = { stats: [
  { name: 'n1', watcher_state: 'started', execution_thread_pool: { queue_size: 1, total: 100 }, execution: { total: 60, total_failed: 2 } },
  { name: 'n2', watcher_state: 'started', execution_thread_pool: { queue_size: 1, total: 80 }, execution: { total: 60, total_failed: 1 } },
  { name: 'n3', watcher_state: 'stopped', execution_thread_pool: { queue_size: 0, total: 20 }, execution: { total: 20, total_failed: 0 } },
] };
const MAIN_762 = {
  stats: STATS_762,
  watches: { hits: { total: { value: 6 }, hits: [
    { _id: 'w-interval', _source: { trigger: { schedule: { interval: '5m' } }, actions: { log: {} }, metadata: { owner: 'ops', long: LONG_META } } },
    { _id: 'w-cron', _source: { trigger: { schedule: { cron: '0 0 * * *' } }, actions: { email: {}, index: {} } } },
    { _id: 'w-unknown', _source: { actions: { log: {} } } },
    { _id: 'w-noact', _source: { trigger: { schedule: { interval: '1h' } } } },
    { _id: 'w-nometa', _source: { trigger: { schedule: { interval: '1h' } }, actions: { log: {} } } },
    { _id: 'w-meta2', _source: { trigger: { schedule: { interval: '1d' } }, actions: { log: {} }, metadata: { team: 'infra' } } },
  ] } },
};
/* many 桶：105 个（id 全含 watch-）→ 截断链 + 过滤分支（kw 命中仍 >100） */
function manyBucket(n = 105) {
  const hits = Array.from({ length: n }, (_, i) => ({
    _id: 'watch-' + String(i).padStart(3, '0'),
    _source: { trigger: { schedule: { interval: '1h' } }, actions: { log: {} } },
  }));
  return {
    stats: STATS_762,
    watches: { hits: { total: { value: n }, hits } },
  };
}

function kwInput(host: ParentNode): HTMLInputElement {
  const el = host.querySelector<HTMLInputElement>('.wt-search-i');
  expect(el, '过滤输入框在场').toBeTruthy();
  return el!;
}
async function setKw(host: ParentNode, v: string) {
  const el = kwInput(host);
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  watcherListFn.mockReset().mockResolvedValue(MAIN_762);
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('762 A0 挂载不变量负锚（现状即守卫，非刀面）', () => {
  it('页头 title+MetaStrip 六段+6 卡+过滤框 placeholder', async () => {
    const host = await mountView();
    expect(host.textContent).toContain('Watcher 告警');
    const segs = host.querySelectorAll('.wt-meta .ms-i');
    expect(segs.length).toBe(6);
    expect(host.textContent).toContain('节点');
    expect(host.textContent).toContain('Watch 数（估）');
    expect(host.textContent).toContain('已启动');
    expect(host.textContent).toContain('340');
    expect(host.textContent).toContain('失败');
    expect(host.querySelectorAll('.wt-card').length).toBe(6);
    expect(kwInput(host).getAttribute('placeholder')).toContain('过滤 watch id');
  });
});

describe('762 G220 四死规则整删（死代码·头号·PageHeader 合并漏删族）', () => {
  it('源码锁：.wt-hd-l/-ic/-tt/-sub 四类名 scoped 绝迹（模板本就零引用）', () => {
    expect(src, '.wt-hd-l 死规则须删').not.toMatch(/\.wt-hd-l\b/);
    expect(src, '.wt-hd-ic 死规则须删').not.toMatch(/\.wt-hd-ic\b/);
    expect(src, '.wt-hd-tt 死规则须删').not.toMatch(/\.wt-hd-tt\b/);
    expect(src, '.wt-hd-sub 死规则须删').not.toMatch(/\.wt-hd-sub\b/);
  });
  it('活规则不受扰：.wt-hd 基础规则+1100 堆叠档在场（obsStack530 锁口径）', () => {
    expect(src).toMatch(/\.wt-hd \{ display: flex; justify-content: space-between;/);
    expect(src).toMatch(/\.wt-hd \{ flex-direction: column; align-items: flex-start; gap: var\(--sp-2\); \}/);
  });
});

describe('762 G221 过滤词口径注释诚实化（行为零改·748 G176/754 G202/757 G207 同族第四例）', () => {
  it('源码锁：「进 URL」失实宣称绝迹，会话草稿口径毗邻 kw 声明', () => {
    expect(src, '失实宣称须删').not.toContain('过滤词进 URL');
    expect(src, '诚实口径注释须与 kw 声明同域（会话草稿/sessionStorage）')
      .toMatch(/会话草稿[\s\S]{0,160}?const kw = useScopedDraft\('kw', \{ route: 'watcher' \}/);
  });
  it('行为实锚（注释新口径守卫）：kw 落 sessionStorage 草稿、不进 hash', async () => {
    const host = await mountView();
    await setKw(host, 'interval');
    expect(location.hash, 'kw 不进 URL（失实宣称的反证锚）').not.toContain('kw');
    const draftKeys = Object.keys(sessionStorage).filter(k => k.includes('draft2:watcher'));
    expect(draftKeys.length, '草稿键在场（useScopedDraft sessionStorage 通道）').toBeGreaterThan(0);
    expect(Object.values(sessionStorage).join(' ')).toContain('interval');
    expect(host.querySelectorAll('.wt-card').length).toBe(4); /* w-interval/w-noact/w-nometa/w-meta2 命中 */
  });
});

describe('762 G222 截断标志真纯化（354 批宣称与实况不符→落 computed 派生）', () => {
  it('源码锁：matchedWatches 同源派生+filteredTruncated 纯 computed；computed 内写 ref 绝迹', () => {
    expect(src).toMatch(/const matchedWatches = computed/);
    expect(src).toMatch(/const filteredTruncated = computed\(\(\) => matchedWatches\.value\.length > 100\);/);
    expect(src, 'side-effect 置位形态绝迹（353 旧锁形态退役）').not.toMatch(/filteredTruncated\.value = hit\.length > 100;/);
    expect(src, 'ref 初值形态绝迹（344 旧锁形态退役）').not.toMatch(/const filteredTruncated = ref\(false\);/);
  });
  it('行为链：many 105 → 前 100 卡+计数提示（无关键字分支语义不变）', async () => {
    watcherListFn.mockResolvedValue(manyBucket());
    const host = await mountView();
    expect(host.querySelectorAll('.wt-card').length).toBe(100);
    expect(host.textContent).toContain('已显示前 100 个（共 105 个）');
  });
  it('行为链：过滤分支命中仍 >100 → 计数提示在场（353 分支语义随纯化保持）', async () => {
    watcherListFn.mockResolvedValue(manyBucket());
    const host = await mountView();
    await setKw(host, 'watch'); /* 命中全部 105（id 全含 watch-）→ 过滤后仍 >100 */
    expect(host.querySelectorAll('.wt-card').length).toBe(100);
    expect(host.textContent).toContain('已显示前 100 个');
    await setKw(host, 'zzz');
    expect(host.textContent).toContain('无匹配 watch');
  });
});

describe('762 G223 metadata popover 触发器键盘可达（G208 cd-chip 族·次刀）', () => {
  it('挂载实锚：触发器 code 带 role=button+tabindex=0+中文 aria-label', async () => {
    const host = await mountView();
    const code = host.querySelector('.wt-card-meta code');
    expect(code, 'metadata 触发器在场（main 桶 w-interval 卡）').toBeTruthy();
    expect(code!.getAttribute('role')).toBe('button');
    expect(code!.getAttribute('tabindex')).toBe('0');
    expect(code!.getAttribute('aria-label')).toContain('metadata');
  });
  it('行为链：Enter 合成 click 冒泡到 n-popover trigger 包装层（keydown 接线实锚）', async () => {
    const host = await mountView();
    const code = host.querySelector('.wt-card-meta code')!;
    let clicked = false;
    host.addEventListener('click', () => { clicked = true; }, { once: true });
    code.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(clicked, 'Enter → click 事件合成且冒泡（n-popover click 通道可达）').toBe(true);
  });
});

describe('762 G224 wt-list 容器 aria（757 G210 族·随批可裁）', () => {
  it('挂载实锚：role=group+aria-label=watch 清单', async () => {
    const host = await mountView();
    const list = host.querySelector('.wt-list');
    expect(list, '.wt-list 容器在场').toBeTruthy();
    expect(list!.getAttribute('role')).toBe('group');
    expect(list!.getAttribute('aria-label')).toBe('watch 清单');
  });
});

describe('762 G226 MetaStrip 三段补中文 tip（铁律 F·G55/G60/G74/G112 同族·随批可裁）', () => {
  it('挂载实锚：队列/已执行/失败三段 title 在场（含 _watcher/stats 字段来源）', async () => {
    const host = await mountView();
    const tips = Array.from(host.querySelectorAll('.wt-meta .ms-i')).map(el => el.getAttribute('title'));
    expect(tips[3], '队列（当前）段 tip').toContain('队列');
    expect(tips[3]).toContain('queue_size');
    expect(tips[4], '已执行段 tip').toContain('执行');
    expect(tips[5], '失败段 tip').toContain('total_failed');
  });
  it('源码锁：三段 tip 走 wtMeta items（含字段来源释义），状态段既有 tip 不动', () => {
    const m = src.match(/const wtMeta = computed[\s\S]*?\n\]\);/);
    expect(m, 'wtMeta computed 块在场').toBeTruthy();
    const body = m![0];
    expect(body).toContain("label: '队列（当前）'");
    expect(body).toContain("label: '已执行'");
    expect(body).toContain("label: '失败'");
    expect(body.match(/tip:/g)!.length).toBeGreaterThanOrEqual(4); /* 状态段 1+新增 3 */
    expect(body).toContain('queue_size');
    expect(body).toContain('total_failed');
  });
});
