/**
 * 七百一十五批：RemoteClusters 首刀=G55+G56「meta 中文备注+死样式清」
 * （R95 裁决表头号；铁律 F「任何英文参数必须有中文备注」）。
 * - G55（P3 铁律 F）：metaOf 四段 label 英文裸词无中文备注——seeds/proxy/
 *   initial_timeout 三段悬停零备注，skip_unavailable 仅 true 段有 tip（容忍断连），
 *   false 段悬停零备注 → 四段 tip 中文备注补齐（true 段既有 warn tone+文案零触）。
 * - G56（P3 死代码）：.rc-hd-l/-ic/-tt/-sub 四类死样式族——模板已合并 PageHeader
 *   无对应元素（713 批 .pl-hd 五类同族先例，PluginsView 五百二十七批 W-F 同款删除）。
 *
 * 设施：clusterThreeState 范式（api 出口可变 mock+settle 链）；种子=714 probe 同款
 * 三卡（sniff 双 seeds 连接/proxy skip=true 连接/sniff 单 seed 未连接）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const remoteFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      remoteClusters: (...args: any[]) => remoteFn(...args),
    },
  };
});

import RemoteClustersView from '../views/RemoteClustersView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(RemoteClustersView) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

/* 714 probe 同种子三卡：search-prod（sniff 双 seeds+skip false+timeout）/
   logs-archive（proxy+skip true）/beta-cluster（单 seed 未连接无 skip） */
function seedRemotes() {
  remoteFn.mockResolvedValue({
    localClusterName: 'esquerystudio-main',
    localVersion: { number: '8.11.4' },
    remotes: {
      'search-prod': {
        seeds: ['10.0.0.1:9300', '10.0.0.2:9300'], connected: true, num_nodes_connected: 5,
        mode: 'sniff', skip_unavailable: false, initial_connect_timeout: '30s',
      },
      'logs-archive': {
        proxy_address: 'http://proxy.internal:9300', connected: true, num_nodes_connected: 3,
        mode: 'proxy', skip_unavailable: true,
      },
      'beta-cluster': { seeds: ['10.9.9.9:9300'], connected: false },
    },
  });
}

/* 卡内按 label 定位 MetaStrip 段（<span class="ms-i"><b>值</b> <i>label</i></span>） */
function metaSeg(card: Element, label: string): HTMLElement | undefined {
  return Array.from(card.querySelectorAll<HTMLElement>('.ms-i')).find(el => {
    const i = el.querySelector('i');
    return !!i && i.textContent?.trim() === label;
  });
}

function cards(host: HTMLElement) {
  return Array.from(host.querySelectorAll('.rc-card'));
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  remoteFn.mockReset();
});

describe('G55：metaOf 四段 label 中文备注补齐（铁律 F 英文参数必须有中文备注）', () => {
  it('① seeds 段 title=种子节点地址；initial_timeout 段 title=初始连接超时', async () => {
    seedRemotes();
    const { host } = await mountView();
    const card0 = cards(host)[0];
    expect(card0, 'search-prod 卡必须在场').toBeTruthy();
    const segSeeds = metaSeg(card0, 'seeds');
    expect(segSeeds, 'seeds 段必须在场（sniff 卡）').toBeTruthy();
    expect(segSeeds!.getAttribute('title'), 'seeds 段中文备注').toBe('种子节点地址');
    const segTo = metaSeg(card0, 'initial_timeout');
    expect(segTo, 'initial_timeout 段必须在场（有超时值卡）').toBeTruthy();
    expect(segTo!.getAttribute('title'), 'initial_timeout 段中文备注').toBe('初始连接超时');
  });

  it('② proxy 段 title=代理地址（proxy 卡）', async () => {
    seedRemotes();
    const { host } = await mountView();
    const card1 = cards(host)[1];
    const segProxy = metaSeg(card1, 'proxy');
    expect(segProxy, 'proxy 段必须在场（proxy 卡）').toBeTruthy();
    expect(segProxy!.getAttribute('title'), 'proxy 段中文备注').toBe('代理地址');
  });

  it('③ skip_unavailable 双形态：false 段补中文备注；true 段既有容忍断连 tip+warn tone 零回归', async () => {
    seedRemotes();
    const { host } = await mountView();
    const [card0, card1] = cards(host);
    const segFalse = metaSeg(card0, 'skip_unavailable');
    expect(segFalse, 'skip false 段必须在场').toBeTruthy();
    expect(segFalse!.getAttribute('title'), 'false 段补齐中文备注（R95 时点悬停零备注）')
      .toBe('远端不可达时是否跳过（当前 false：不可达即报错）');
    expect(segFalse!.querySelector('b')!.className, 'false 段不带 warn 色（语义差=色差契约保持）')
      .not.toContain('ms-warn');
    const segTrue = metaSeg(card1, 'skip_unavailable');
    expect(segTrue, 'skip true 段必须在场').toBeTruthy();
    expect(segTrue!.getAttribute('title'), 'true 段既有降级解释文案零回归')
      .toBe('容忍断连：远端集群不可达时查询可降级继续');
    expect(segTrue!.querySelector('b')!.className).toContain('ms-warn');
  });

  it('④ 负锚：备注只走悬浮 title，不污染信息串可见文本（meta 串保持紧凑）', async () => {
    seedRemotes();
    const { host } = await mountView();
    const card0 = cards(host)[0];
    expect(card0.textContent).not.toContain('种子节点地址');
    expect(card0.textContent).not.toContain('初始连接超时');
  });
});

describe('G55 源码锁：metaOf 四段 tip 全落源码+陈旧注释退役', () => {
  it('⑤ 四段 tip 字面在 metaOf；「false 段无 tip」史志注释如实化', () => {
    const v = readFileSync(join(__dirname, '../views/RemoteClustersView.vue'), 'utf-8');
    expect(v).toMatch(/label:\s*'seeds',\s*tip:\s*'种子节点地址'/);
    expect(v).toMatch(/label:\s*'proxy',\s*tip:\s*'代理地址'/);
    expect(v).toMatch(/tip:\s*'远端不可达时是否跳过（当前 false：不可达即报错）'/);
    expect(v).toMatch(/label:\s*'initial_timeout',\s*tip:\s*'初始连接超时'/);
    expect(v, '「false 段无 tip」注释必须随行为如实化（713 G53 注释纪律同款）')
      .not.toContain('false 段无 tip');
  });
});

describe('G56：页头家族死样式清（模板已用 PageHeader，无对应元素）', () => {
  it('⑥ 源码锁：.rc-hd-l/-ic/-tt/-sub 四类规则零残留；活规则 .rc-hd 保留', () => {
    const v = readFileSync(join(__dirname, '../views/RemoteClustersView.vue'), 'utf-8');
    expect(v, '页头家族死规则必须退役（713 批 .pl-hd 同族先例）')
      .not.toMatch(/\.rc-hd-(l|ic|tt|sub)\b/);
    expect(v, '活规则 .rc-hd（PageHeader 外距/分隔锚）保留').toMatch(/\.rc-hd\s*\{/);
  });
});
