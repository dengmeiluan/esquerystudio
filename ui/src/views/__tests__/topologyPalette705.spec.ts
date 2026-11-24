/**
 * 七百零五批（R85 G33 第二刀）：Topology 索引调色板搜索 + 收纳。
 *
 * G33（P2）：26 chips 平铺无搜索无收纳——900 档 5 行占视口 22%、生产 100+ 索引
 *   20+ 行爆炸（铁律 B 可检索缺位）。锁：超阈值（>24）默认折叠 24 +「+N 更多」、
 *   展开态 usePref 记忆、搜索前缀/通配（* ?）客户端匹配、搜索态不收纳（主动收窄
 *   优先）、零匹配不空区；全量计数标题 / 点击 chip 过滤动线 / on·dim 契约零触。
 * G38（P3）：onTip 空函数 + @mousemove 死绑定随手清（源码锁，tooltip 跟随稳定
 *   由 cellEnter 锚定设计使然，@mouseleave 退场保留）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 可变 mock 数据集（vi.hoisted 防工厂提升时序）：默认 26 索引 × 2 分片（1主1副）
   布两节点 = 52 分片；前缀三组 alpha-*(10) / beta-*(10) / order-flow-*(6) 便于
   搜索差分；阈值下场景换 2 索引小数据集 */
const hoist = vi.hoisted(() => ({ shards: [] as any[] }));
function bigShards(): any[] {
  const out: any[] = [];
  for (const g of [{ p: 'alpha', n: 10 }, { p: 'beta', n: 10 }, { p: 'order-flow', n: 6 }]) {
    for (let i = 0; i < g.n; i++) {
      const idx = `${g.p}-${String(i).padStart(2, '0')}`;
      out.push({ index: idx, shard: 0, prirep: 'p', state: 'STARTED', node: 'n1', ip: '10.0.0.1', docs: 10, storeBytes: 1024 });
      out.push({ index: idx, shard: 0, prirep: 'r', state: 'STARTED', node: 'n2', ip: '10.0.0.2', docs: 10, storeBytes: 1024 });
    }
  }
  return out;
}

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      shards: vi.fn(async () => hoist.shards),
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

/* chips 清点排除收纳钮（tp-chip-more 同 class 族） */
function chips(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll('.tp-chips .tp-chip:not(.tp-chip-more)'));
}
function moreBtn(host: HTMLElement): HTMLElement | null {
  return host.querySelector('.tp-chip-more');
}
function palSearch(host: HTMLElement): HTMLInputElement {
  const el = host.querySelector<HTMLInputElement>('.tp-pal-search');
  if (!el) throw new Error('搜索框不在场（G33 病灶：无搜索）');
  return el;
}
async function setSearch(host: HTMLElement, v: string) {
  const inp = palSearch(host);
  inp.value = v;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}
function metaShardTotal(host: HTMLElement): number {
  const el = Array.from(host.querySelectorAll('.top-meta .ms-i'))[1];
  return Number(el?.querySelector('b')?.textContent ?? NaN);
}

const PREF_KEY = 'esquerystudio.pref.shards.paletteExpanded';
beforeEach(() => {
  hoist.shards = bigShards();
  localStorage.removeItem(PREF_KEY);
});
afterEach(() => { localStorage.removeItem(PREF_KEY); });

describe('Topology 调色板收纳（G33/705 批）', () => {
  it('26 索引默认折叠：24 chips +「+2 更多」，标题恒全量计数 26', async () => {
    const { host, app } = await mountTp();
    expect(palSearch(host), '搜索框在场（G33 病灶：无搜索）').toBeTruthy();
    expect(chips(host).length, '超阈值默认折叠至 24').toBe(24);
    const more = moreBtn(host);
    expect(more, '收纳钮在场').toBeTruthy();
    expect(more!.textContent).toContain('+2');
    expect(more!.textContent).toContain('更多');
    const title = host.querySelector('.tp-palette .card-t')!.textContent!;
    expect(title, '全量计数契约不动').toContain('26');
    app.unmount();
    host.remove();
  });

  it('展开全量 26 + 收起钮；usePref 记忆重挂载仍展开；收起回落折叠', async () => {
    const { host, app } = await mountTp();
    moreBtn(host)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(chips(host).length, '展开后全量可见').toBe(26);
    expect(moreBtn(host)!.textContent).toContain('收起');
    app.unmount();
    host.remove();

    /* 重挂载：展开态 usePref 记忆（铁律 B 状态落盘） */
    const m2 = await mountTp();
    expect(chips(m2.host).length, '重进页面展开态还原').toBe(26);
    moreBtn(m2.host)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(chips(m2.host).length, '收起回落折叠').toBe(24);
    expect(moreBtn(m2.host)!.textContent).toContain('+2');
    m2.app.unmount();
    m2.host.remove();
  });

  it('搜索通配 alpha-*：恰 10 命中全 alpha 前缀且不收纳；清空回落默认折叠 24', async () => {
    const { host, app } = await mountTp();
    await setSearch(host, 'alpha-*');
    const hit = chips(host);
    expect(hit.length, '通配匹配 10 个').toBe(10);
    expect(hit.every(c => c.textContent!.includes('alpha-'))).toBe(true);
    expect(moreBtn(host), '搜索态不收纳（主动收窄优先）').toBeNull();
    await setSearch(host, '');
    expect(chips(host).length, '清空回落默认折叠态').toBe(24);
    app.unmount();
    host.remove();
  });

  it('搜索前缀：beta → 10；order → 6；零匹配 → 提示不空区且主图不受扰', async () => {
    const { host, app } = await mountTp();
    await setSearch(host, 'beta');
    expect(chips(host).length).toBe(10);
    await setSearch(host, 'order');
    expect(chips(host).length).toBe(6);
    await setSearch(host, 'zzz-nope');
    expect(chips(host).length, '零匹配 0 chips').toBe(0);
    expect(host.querySelector('.tp-pal-none')?.textContent).toContain('无匹配');
    expect(host.querySelector('.tp-svg'), '主图不受搜索词影响').toBeTruthy();
    app.unmount();
    host.remove();
  });

  it('契约锁：搜索态点命中 chip 过滤动线仍生效（on class + 分片缩窄），标题全量计数不动', async () => {
    const { host, app } = await mountTp();
    await setSearch(host, 'order-flow-0');
    expect(chips(host).length, '前缀 order-flow-0 命中 00~05 共 6').toBe(6);
    const chip = chips(host).find(c => c.textContent!.includes('order-flow-00'))!;
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(chip.classList.contains('on'), '命中 chip on 态契约').toBe(true);
    expect(metaShardTotal(host), '点击过滤动线：分片 value 缩窄至该索引 2 分片').toBe(2);
    expect(host.querySelector('.tp-palette .card-t')!.textContent!, '标题全量计数不动').toContain('26');
    app.unmount();
    host.remove();
  });

  it('阈值下小数据集（2 索引）：无收纳钮全量平铺，搜索框仍在场', async () => {
    hoist.shards = [
      { index: 'idx-a', shard: 0, prirep: 'p', state: 'STARTED', node: 'n1', ip: '10.0.0.1', docs: 10, storeBytes: 1024 },
      { index: 'idx-b', shard: 0, prirep: 'r', state: 'STARTED', node: 'n2', ip: '10.0.0.2', docs: 5, storeBytes: 512 },
    ];
    const { host, app } = await mountTp();
    expect(chips(host).length, '阈值下全量平铺').toBe(2);
    expect(moreBtn(host), '无收纳钮').toBeNull();
    expect(palSearch(host), '搜索框恒显（≤阈值亦可用）').toBeTruthy();
    app.unmount();
    host.remove();
  });
});

describe('Topology onTip 死代码清理（G38/705 批）', () => {
  it('源码锁：onTip 符号清零 + @mousemove 死绑定移除（@mouseleave 退场保留）', () => {
    const src = readFileSync(join(__dirname, '../TopologyView.vue'), 'utf-8');
    expect(src.includes('onTip'), 'G38 病灶：onTip 空函数须清').toBe(false);
    expect(src.includes('@mousemove'), '死绑定同随函数清除').toBe(false);
    expect(src.includes('@mouseleave="tip = null"'), 'tip 退场活代码保留').toBe(true);
  });
});
