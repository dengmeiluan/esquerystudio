/**
 * 七百七十三批（R85 G34+G35 留存轮）：Topology 分片格目标尺寸 + 节点卡磁盘水位/角色。
 *
 * G34（P2 WCAG 2.5.8）：CELL=14 viewBox 844 被 width:100% 拉伸——900 档 12.8px /
 *   1280 档 16.5px / 1600 档 21.8px 全档未达 24px 最小目标尺寸。锁：CELL=16/GAP=4
 *   （W=844 布局零触）+ .tp-svg minWidth 保底=ceil(W/CELL*24)=1266px——容器宽不足时
 *   SVG 定宽 1266（渲染 CELL 恒 24px），画布 overflow:auto 受控横滚承接。
 * G35（P2）：节点卡仅名+IP+分片数+存储——nodes-stats-brief 端点在档未消费。锁：
 *   磁盘水位行+条（色档走 metricThresholds 单源 metricColor('disk',·)，禁自造阈值）、
 *   progressbar aria、master/角色徽标（roles.includes('master')，ES 术语英文保留）；
 *   端点失败 [] 兜底回落无磁盘形态（页面不炸）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GB = 1024 ** 3;

/* 三节点三色档差分：n1 72% ok / n2 83% warn（≥80）/ n3 91% bad（≥90）——
   阈值档位属 metricThresholds 单源（disk warn 80 / bad 90），此处只造数据不判档 */
const SHARDS = [
  { index: 'idx-a', shard: 0, prirep: 'p', state: 'STARTED', node: 'n1', ip: '10.0.0.1', docs: 10, storeBytes: 1024 },
  { index: 'idx-a', shard: 0, prirep: 'r', state: 'STARTED', node: 'n2', ip: '10.0.0.2', docs: 10, storeBytes: 1024 },
  { index: 'idx-b', shard: 0, prirep: 'p', state: 'STARTED', node: 'n3', ip: '10.0.0.3', docs: 5, storeBytes: 512 },
  { index: 'idx-b', shard: 0, prirep: 'r', state: 'UNASSIGNED', node: null, ip: null, docs: null, storeBytes: null },
];
const FULL_BRIEF = [
  { name: 'n1', roles: ['master', 'data'], diskTotal: 300 * GB, diskFree: 84 * GB },
  { name: 'n2', roles: ['data'], diskTotal: 200 * GB, diskFree: 34 * GB },
  { name: 'n3', roles: ['data', 'ingest'], diskTotal: 100 * GB, diskFree: 9 * GB },
];

const hoist = vi.hoisted(() => ({ brief: [] as any[] }));
vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      shards: vi.fn(async () => SHARDS),
      clusterHealth: vi.fn(async () => ({ status: 'green', number_of_nodes: 3, number_of_data_nodes: 3 })),
      nodesStatsBrief: vi.fn(async () => hoist.brief),
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

/* 按节点名定位组（g 无标识类，经 .tp-node-name 文本反查最近 g；
   953 随迁：名字 text 现内嵌 <title> 全名兜底子元素，textContent 会并入
   title 文本——只取直接文本子节点才是可见名） */
function nodeGroup(host: HTMLElement, name: string): SVGGElement | null {
  const t = Array.from(host.querySelectorAll<SVGElement>('.tp-node-name'))
    .find(el => Array.from(el.childNodes)
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent ?? '')
      .join('')
      .trim() === name);
  return (t?.closest('g') as SVGGElement) || null;
}

beforeEach(() => { hoist.brief = FULL_BRIEF; });

describe('Topology 留存轮挂载不变量（A0/773 批现状守卫）', () => {
  it('挂载成功：tp-svg 在场 + 4 分片格（3 已分配 + 1 未分配组）+ ⚠ 未分配异常态', async () => {
    const { host, app } = await mountTp();
    expect(host.querySelector('.tp-svg')).toBeTruthy();
    expect(host.querySelectorAll('.tp-cell').length).toBe(4);
    expect(host.querySelector('.tp-node-un'), '未分配异常红框档在场').toBeTruthy();
    app.unmount();
    host.remove();
  });

  it('viewBox W 恒 844（G34 布局零触锁：NODE_W/网格参数不动）', async () => {
    const { host, app } = await mountTp();
    const vb = host.querySelector('.tp-svg')!.getAttribute('viewBox') || '';
    expect(vb.startsWith('0 0 844 '), 'W=3*(260+16)+16 恒定').toBe(true);
    app.unmount();
    host.remove();
  });

  it('分片格键盘契约不动：role=button + aria-label（704 G32 接线守卫）', async () => {
    const { host, app } = await mountTp();
    const g = host.querySelector('.tp-cell')!.closest('g')!;
    expect(g.getAttribute('role')).toBe('button');
    expect(g.getAttribute('aria-label')).toContain('分片 0');
    app.unmount();
    host.remove();
  });
});

describe('Topology G34 分片格目标尺寸（773 批）', () => {
  it('源码锁：CELL=16/GAP=4 + .tp-svg minWidth 保底绑定（W/CELL*24 派生）', () => {
    const src = readFileSync(join(__dirname, '../TopologyView.vue'), 'utf8');
    expect(src).toMatch(/const CELL = 16;/);
    expect(src).toMatch(/const GAP = 4;/);
    expect(src, 'minWidth 保底与 viewBox 宽联动派生（非硬编码 px）').toMatch(/svgMinW/);
    expect(src).toMatch(/24/);
  });

  it('挂载态：.tp-svg minWidth ≥ 1266px（844/16*24，WCAG 2.5.8 最小目标尺寸）', async () => {
    const { host, app } = await mountTp();
    const svg = host.querySelector('.tp-svg') as unknown as HTMLElement;
    const mw = svg.style.minWidth;
    expect(mw, 'inline minWidth 保底在场').toBeTruthy();
    expect(parseInt(mw, 10)).toBeGreaterThanOrEqual(1266);
    app.unmount();
    host.remove();
  });
});

describe('Topology G35 节点卡磁盘水位 + 角色（773 批）', () => {
  it('磁盘水位行：n1「磁盘 72%」+ 已用/总量双读数（232 GB / 300 GB）', async () => {
    const { host, app } = await mountTp();
    const disk = nodeGroup(host, 'n1')?.querySelector('.tp-disk');
    expect(disk, 'n1 磁盘组在场（G35 病灶=无磁盘维度）').toBeTruthy();
    const txt = disk?.textContent || '';
    expect(txt).toContain('磁盘 72%');
    expect(txt).toContain('216.0 GB');
    expect(txt).toContain('300.0 GB');
    app.unmount();
    host.remove();
  });

  it('水位条 aria：role=progressbar + aria-valuenow=72 + aria-label 含节点名', async () => {
    const { host, app } = await mountTp();
    const disk = nodeGroup(host, 'n1')?.querySelector('.tp-disk');
    expect(disk!.getAttribute('role')).toBe('progressbar');
    expect(disk!.getAttribute('aria-valuenow')).toBe('72');
    expect(disk!.getAttribute('aria-label')).toContain('n1');
    expect(disk!.getAttribute('aria-valuemax')).toBe('100');
    app.unmount();
    host.remove();
  });

  it('色档走 metricThresholds 单源：72%→--ok / 83%→--warn / 91%→--err（禁自造阈值）', async () => {
    const { host, app } = await mountTp();
    const barFill = (name: string) => nodeGroup(host, name)?.querySelector('.tp-disk-bar')?.getAttribute('fill');
    expect(barFill('n1')).toBe('var(--ok)');
    expect(barFill('n2')).toBe('var(--warn)');
    expect(barFill('n3')).toBe('var(--err)');
    app.unmount();
    host.remove();
  });

  it('master/角色徽标：n1 master 高亮 tspan 在场；n2 无 master 徽标（data 角色）', async () => {
    const { host, app } = await mountTp();
    const role1 = nodeGroup(host, 'n1')?.querySelector('.tp-node-role');
    expect(role1, 'n1 角色文本在场').toBeTruthy();
    expect(role1!.textContent).toContain('master');
    expect(role1!.querySelector('.tp-role-master'), 'master 高亮档').toBeTruthy();
    const role2 = nodeGroup(host, 'n2')?.querySelector('.tp-node-role');
    expect(role2?.textContent).toContain('data');
    expect(role2!.querySelector('.tp-role-master')).toBeNull();
    app.unmount();
    host.remove();
  });

  it('磁盘 <title> 释义在场（铁律 F：阈值档中文说明）', async () => {
    const { host, app } = await mountTp();
    const title = nodeGroup(host, 'n1')?.querySelector('.tp-disk title');
    expect(title?.textContent).toContain('80');
    app.unmount();
    host.remove();
  });

  it('端点失败兜底：nodesStatsBrief 返回 [] → 无磁盘行无角色，分片矩阵照常', async () => {
    hoist.brief = [];
    const { host, app } = await mountTp();
    expect(host.querySelectorAll('.tp-disk').length).toBe(0);
    expect(host.querySelectorAll('.tp-node-role').length).toBe(0);
    expect(host.querySelectorAll('.tp-cell').length, '主数据不受端点失败影响').toBe(4);
    expect(host.querySelector('.tp-svg')).toBeTruthy();
    app.unmount();
    host.remove();
  });
});
