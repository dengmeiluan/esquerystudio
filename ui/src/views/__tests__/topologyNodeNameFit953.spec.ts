/* 九百五十三批（用户实报）：Topology 节点名×角色标签同行避撞。
 *
 * 现象（截图实锚）：长主机名（es-cn 系 23 字符级实例主机名）与右锚角色串
 * （data · ingest，x=NODE_W-12 text-anchor=end）在 NODE_W=260 卡内中段重叠——
 * SVG 文本无自动省略，两段 y=18 同行文本相向绘制必撞。
 * 锁：fitNodeName 估宽截断名字（--fs-sm mono 600 ≈7.4/字符、--fs-xs mono ≈6.6/字符，
 * viewBox 单位与渲染缩放无关）+全名 <title> 悬浮兜底+短名零触；
 * 模板接线 g.nameFit + title。渲染断言走直接文本子节点（SVG <title> 会并入
 * textContent，须剥离子节点取纯名）。 */
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LONG = 'es-cn-abc402duf0003fmwz'; /* 23 字符，云厂商实例主机名同级长度 */
const SHARDS = [
  { index: 'idx-a', shard: 0, prirep: 'p', state: 'STARTED', node: LONG, ip: '10.0.0.9', docs: 10, storeBytes: 1024 },
  { index: 'idx-a', shard: 1, prirep: 'p', state: 'STARTED', node: LONG, ip: '10.0.0.9', docs: 10, storeBytes: 1024 },
  { index: 'idx-a', shard: 2, prirep: 'p', state: 'STARTED', node: 'n1', ip: '10.0.0.1', docs: 5, storeBytes: 512 },
];
const BRIEF = [
  { name: LONG, roles: ['data', 'ingest'], diskTotal: 200, diskFree: 100 },
  { name: 'n1', roles: ['data'], diskTotal: 100, diskFree: 50 },
];

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      shards: vi.fn(async () => SHARDS),
      nodesStatsBrief: vi.fn(async () => BRIEF),
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

/* SVG <text> 的 textContent 会并入 <title> 子元素文本——直接文本子节点才是可见名 */
function directText(el: Element): string {
  return Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent ?? '').join('');
}

describe('Topology 节点名×角色避撞（953 用户实报）', () => {
  it('长主机名估宽截断带 … 且全名进 title；短名零触', async () => {
    const { host, app } = await mountTp();
    const texts = Array.from(host.querySelectorAll('text.tp-node-name'));
    expect(texts.length, '两节点名在档').toBe(2);
    const longEl = texts.find(t => (t.querySelector('title')?.textContent ?? '') === LONG || directText(t).includes(LONG.slice(0, 8)))!;
    expect(longEl, '长名节点在档').toBeTruthy();
    const rendered = directText(longEl);
    const budget = Math.floor((260 - 24 - 'data · ingest'.length * 6.6) / 7.4);
    expect(rendered.endsWith('…'), '长名截断带省略号（用户实报病灶：全名直绘与角色重叠）').toBe(true);
    expect(rendered.length, '渲染长度=估宽预算').toBe(budget);
    expect(longEl.querySelector('title')?.textContent, '全名 title 悬浮兜底').toBe(LONG);
    const shortEl = texts.find(t => t.querySelector('title')?.textContent === 'n1')!;
    expect(shortEl, '短名节点在档').toBeTruthy();
    expect(directText(shortEl), '短名零触不截').toBe('n1');
    /* 避撞不变量：名（fs-sm mono）+角色（fs-xs mono）估宽和 ≤ NODE_W-24 */
    expect(rendered.length * 7.4 + 'data · ingest'.length * 6.6, '估宽和不出卡').toBeLessThanOrEqual(236);
    app.unmount();
    host.remove();
  });

  it('源码锁：fitNodeName 助手+常数+模板接线（防回潮）', () => {
    const src = readFileSync(join(__dirname, '../TopologyView.vue'), 'utf8');
    expect(src, '估宽助手在位').toMatch(/function fitNodeName\(name: string, roleTxt: string, isMaster: boolean\): string/);
    expect(src, '名字符宽常数').toMatch(/TP_NAME_CHAR_W = 7\.4/);
    expect(src, '角色符宽常数').toMatch(/TP_ROLE_CHAR_W = 6\.6/);
    expect(src, '预算下限 4 防 TODO 式空名').toMatch(/Math\.max\(4, Math\.floor\(\(NODE_W - 24 - roleW\) \/ TP_NAME_CHAR_W\)\)/);
    expect(src, '模板接线 nameFit').toMatch(/\{\{ g\.nameFit \}\}/);
    expect(src, 'title 全名兜底').toMatch(/<title>\{\{ g\.node \}\}<\/title>/);
    expect(src, 'layout 装配 nameFit').toMatch(/g\.nameFit = fitNodeName\(g\.node, g\.roleTxt \?\? '', !!g\.isMaster\)/);
  });
});
