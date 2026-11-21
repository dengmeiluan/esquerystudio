/**
 * 七百零四批（R85 G31+G32 首刀）：Topology 拓扑口径统一 + 分片格键盘焦点反馈。
 *
 * G31（P1）：MetaStrip 过滤态口径自相矛盾——分片项 value 用全量 shards.length 而主/副
 *   拆分用 filtered、索引项用全量 indexPalette.size 却标「当前视图」。锁：过滤态
 *   value 与主+副自洽、索引数=当前视图唯一索引数、:title 同口径、全量对照走 tip。
 * G32（P1）：SVG 分片格 tabindex/aria/Enter 在场但零视觉反馈且聚焦不显 tip。锁：
 *   @focus 驱动 tip 展示、@blur 撤自己的 tip、:focus-visible 焦点环 CSS 在场
 *   （真键盘视觉验证走 probe，635-C2 判例；spec 层锁接线）。
 */
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 两索引两节点：全量 7 分片（主3·副4）节点2 索引2 未分配1；
   过滤 idx-a 后 4 分片（主2·副2）节点2 索引1 未分配0 —— 四口径全有差分位 */
const SHARDS = [
  { index: 'idx-a', shard: 0, prirep: 'p', state: 'STARTED', node: 'n1', ip: '10.0.0.1', docs: 10, storeBytes: 1024 },
  { index: 'idx-a', shard: 0, prirep: 'r', state: 'STARTED', node: 'n2', ip: '10.0.0.2', docs: 10, storeBytes: 1024 },
  { index: 'idx-a', shard: 1, prirep: 'p', state: 'STARTED', node: 'n1', ip: '10.0.0.1', docs: 10, storeBytes: 1024 },
  { index: 'idx-a', shard: 1, prirep: 'r', state: 'STARTED', node: 'n2', ip: '10.0.0.2', docs: 10, storeBytes: 1024 },
  { index: 'idx-b', shard: 0, prirep: 'p', state: 'STARTED', node: 'n1', ip: '10.0.0.1', docs: 5, storeBytes: 512 },
  { index: 'idx-b', shard: 0, prirep: 'r', state: 'STARTED', node: 'n2', ip: '10.0.0.2', docs: 5, storeBytes: 512 },
  { index: 'idx-b', shard: 1, prirep: 'r', state: 'UNASSIGNED', node: null, ip: null, docs: null, storeBytes: null },
];

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      shards: vi.fn(async () => SHARDS),
      clusterHealth: vi.fn(async () => ({ status: 'green', number_of_nodes: 2, number_of_data_nodes: 2 })),
    },
  };
});

import TopologyView from '../TopologyView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountTp() {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(TopologyView) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

type MetaItem = { v: string; label: string; tip: string };
function metaItems(host: HTMLElement): MetaItem[] {
  /* .top-meta 是 MetaStrip 根（fallthrough class 与 .ms 同元素），段项直接下查 */
  return Array.from(host.querySelectorAll('.top-meta .ms-i')).map(el => ({
    v: el.querySelector('b')?.textContent ?? '',
    label: el.querySelector('i')?.textContent ?? '',
    tip: (el as HTMLElement).title ?? '',
  }));
}
function shardTotals(it: MetaItem) {
  return {
    total: Number(it.v),
    pri: Number(it.label.match(/主 (\d+)/)?.[1] ?? NaN),
    rep: Number(it.label.match(/副 (\d+)/)?.[1] ?? NaN),
  };
}

describe('Topology 拓扑口径统一（G31/704 批）', () => {
  it('全量态：7 分片（主3·副4）· 节点2 · 索引2 自洽（常态回归锁）', async () => {
    const { host, app } = await mountTp();
    const m = metaItems(host);
    expect(m.length, '五段 items').toBe(5);
    const t = shardTotals(m[1]);
    expect(t.total).toBe(7);
    expect(t.pri).toBe(3);
    expect(t.rep).toBe(4);
    expect(t.total).toBe(t.pri + t.rep);
    expect(m[0].v).toBe('2');
    expect(m[4].v).toBe('2');
    expect(host.querySelector('.top-meta')!.getAttribute('title'), ':title 同 filtered 口径').toContain('分片总数 7');
    app.unmount();
    host.remove();
  });

  it('过滤态：点 idx-a chip 后 4 分片（主2·副2）· 索引1（当前视图），value 与主+副自洽', async () => {
    const { host, app } = await mountTp();
    const chip = Array.from(host.querySelectorAll('.tp-chip')).find(c => c.textContent!.includes('idx-a'))!;
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    const m = metaItems(host);
    const t = shardTotals(m[1]);
    expect(t.total, '分片 value 必须=当前视图 filtered 数（G31 病灶：全量 7 混编）').toBe(4);
    expect(t.pri).toBe(2);
    expect(t.rep).toBe(2);
    expect(t.total, 'G31 核心自洽断言：value === 主+副').toBe(t.pri + t.rep);
    expect(m[4].v, '索引项=当前视图唯一索引数（G31 病灶：全量 2 标当前视图）').toBe('1');
    expect(m[4].label).toContain('当前视图');
    expect(m[1].tip, '全量对照走 tip 分项标明').toContain('全量 7');
    const title = host.querySelector('.top-meta')!.getAttribute('title')!;
    expect(title, ':title 分片总数同 filtered 口径').toContain('分片总数 4');
    expect(title, ':title 索引同当前视图口径').toContain('索引 1（当前视图）');
    app.unmount();
    host.remove();
  });

  it('取消过滤还原全量口径（106→4→106 动线还原锁的迷你版）', async () => {
    const { host, app } = await mountTp();
    const chip = Array.from(host.querySelectorAll('.tp-chip')).find(c => c.textContent!.includes('idx-a'))!;
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    const t = shardTotals(metaItems(host)[1]);
    expect(t.total).toBe(7);
    expect(t.total).toBe(t.pri + t.rep);
    app.unmount();
    host.remove();
  });
});

describe('Topology 分片格键盘焦点反馈（G32/704 批）', () => {
  it('focus 驱动 tip 展示，blur 撤自己的 tip', async () => {
    const { host, app } = await mountTp();
    const g = host.querySelector('g[role="button"]');
    expect(g, '分片格 g 在场（tabindex/aria 既有契约）').toBeTruthy();
    expect(host.querySelector('.tp-tip'), '聚焦前无 tip').toBeNull();
    g!.dispatchEvent(new FocusEvent('focus'));
    await settle(4);
    const tip = host.querySelector('.tp-tip');
    expect(tip, 'G32 病灶：聚焦后必须显 tip').toBeTruthy();
    expect(tip!.textContent).toContain('idx-a');
    expect(tip!.textContent).toContain('shard #0');
    g!.dispatchEvent(new FocusEvent('blur'));
    await settle(4);
    expect(host.querySelector('.tp-tip'), 'blur 后撤 tip').toBeNull();
    app.unmount();
    host.remove();
  });

  it('源码锁：@focus/@blur 接线 + :focus-visible 焦点环 CSS（真键盘视觉走 probe）', () => {
    const src = readFileSync(join(__dirname, '../TopologyView.vue'), 'utf-8');
    expect(src).toMatch(/@focus="cellFocus\(\$event, s\)"/);
    expect(src).toMatch(/@blur="cellBlur\(s\)"/);
    expect(src, '键盘聚焦焦点环（--ac 描边覆盖 presentation attr）').toMatch(/g:focus-visible > \.tp-cell \{ stroke: var\(--ac\); stroke-width: 2; \}/);
  });
});
