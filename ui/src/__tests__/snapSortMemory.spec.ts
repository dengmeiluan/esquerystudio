/**
 * 二批清零：SnapshotsView 快照卡片流排序（BrowserView clickSort 范式适配卡片流）。
 * 锁定（挂真组件，mock snapshotRepos/snapshotList；happy-dom 下 naive-ui 菜单
 * option 走虚拟列表不渲染，键切换用「click 开菜单 → ArrowDown → Enter」键盘路径驱动）：
 * 1) 默认：顺序=start_time 降序（迁移前固定序语义），sv.sortBy/sv.sortRev 不落盘
 *    （usePref 同值赋值 watch 不触发，默认值不落盘口径同 browser.sortReversed）；
 * 2) 切换排序键：键盘选「名称」→ 顺序真实变化 + esquerystudio.pref.sv.sortBy 落盘；
 * 3) 方向钮：翻转 + esquerystudio.pref.sv.sortRev 落盘，再点回 false；
 * 4) 预置偏好挂载恢复 + duration 缺失兜底 0 排自然序末尾不炸。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const SNAPS = [
  { snapshot: 'snap-c', state: 'SUCCESS', start_time_in_millis: 3000, duration_in_millis: 500, indices: ['i1'] },
  { snapshot: 'snap-a', state: 'SUCCESS', start_time_in_millis: 1000, duration_in_millis: 900, indices: ['i1', 'i2', 'i3'] },
  { snapshot: 'snap-b', state: 'PARTIAL', start_time_in_millis: 2000, indices: ['i1', 'i2'] }, /* 无 duration */
];

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      keys: vi.fn(async () => []),
      clustersList: vi.fn(async () => []),
      snapshotRepos: vi.fn(async () => [{ name: 'repo-a', type: 'fs' }]),
      snapshotList: vi.fn(async () => SNAPS.map(s => ({ ...s }))),
    },
  };
});

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const View = (await import('../views/SnapshotsView.vue')).default;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(View) });
  app.use(createPinia());
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  apps.push(app);
  await settle();
}

/* 卡片渲染序（=filtered 序，HitNav/CSV 同源）——sv-tl-head 里唯一 b 挂 :title=快照名 */
const cardOrder = () => [...host.querySelectorAll('.sv-tl-row b')].map(b => b.getAttribute('title'));

/* 排序 select 是页头第 2 个 n-select（第 1 个=repo 选择）；键盘路径选下一项 */
const sortSelection = () => host.querySelectorAll('.n-base-selection')[1] as HTMLElement;
async function pickNextSortKey() {
  const sel = sortSelection();
  sel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await settle();
  sel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await settle();
  sel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle();
}

const dirBtn = () => host.querySelector('button[aria-label="排序方向"]') as HTMLButtonElement;
const click = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

const KEY_BY = 'esquerystudio.pref.sv.sortBy';
const KEY_REV = 'esquerystudio.pref.sv.sortRev';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('SnapshotsView 卡片流排序记忆（二批清零）', () => {
  it('默认：start_time 降序（迁移前固定序语义），偏好键不落盘', { timeout: 20000 }, async () => {
    await mountView();
    expect(cardOrder()).toEqual(['snap-c', 'snap-b', 'snap-a']);
    expect(localStorage.getItem(KEY_BY)).toBeNull();
    expect(localStorage.getItem(KEY_REV)).toBeNull();
  });

  it('键盘切换排序键=名称：顺序真实变化 + sortBy 落盘', { timeout: 20000 }, async () => {
    await mountView();
    await pickNextSortKey();
    expect(cardOrder()).toEqual(['snap-a', 'snap-b', 'snap-c']);
    expect(localStorage.getItem(KEY_BY)).toBe('"name"');
  });

  it('方向钮翻转：顺序倒转 + sortRev 落盘 true，再点回 false', { timeout: 20000 }, async () => {
    await mountView();
    expect(cardOrder()).toEqual(['snap-c', 'snap-b', 'snap-a']);
    click(dirBtn());
    await settle();
    expect(cardOrder()).toEqual(['snap-a', 'snap-b', 'snap-c']);
    expect(localStorage.getItem(KEY_REV)).toBe('true');
    expect(dirBtn().getAttribute('aria-pressed')).toBe('true');
    click(dirBtn());
    await settle();
    expect(cardOrder()).toEqual(['snap-c', 'snap-b', 'snap-a']);
    expect(localStorage.getItem(KEY_REV)).toBe('false');
  });

  it('预置 sortBy=duration 挂载恢复；duration 缺失兜底 0 排自然序末尾', { timeout: 20000 }, async () => {
    localStorage.setItem(KEY_BY, JSON.stringify('duration'));
    await mountView();
    expect(cardOrder()).toEqual(['snap-a', 'snap-c', 'snap-b']);
  });

  it('预置 sortBy=indices 挂载恢复（索引数 多→少自然方向）', { timeout: 20000 }, async () => {
    localStorage.setItem(KEY_BY, JSON.stringify('indices'));
    await mountView();
    expect(cardOrder()).toEqual(['snap-a', 'snap-b', 'snap-c']);
  });
});
