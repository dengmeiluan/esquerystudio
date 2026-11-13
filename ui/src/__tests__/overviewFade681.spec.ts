/* 681 批【概览】R75 差距 G17 解锁（备案低优，用户令全开刀）：.ov-topo-nodes 节点条横向溢出
 * （节点多放不下）时无「可横滚」视觉暗示。落一刀最小修复：
 *  · 溢出判定抽纯函数 evalTopoClip(sw, cw) = sw > cw + 1（+1 容差——亚像素取整抖动不误报）。
 *    589 先例：happy-dom 布局宽度恒 0，纯函数 + 类绑定才可测，组件仅持 ref 消费。
 *  · topoClip=true 渲染真元素 .ov-topo-fade（v-if，勿 ::after——可测性优先），右缘 40px
 *    渐隐 linear-gradient(to right, transparent, --bg0)（终点色=分区所在页面底色，554 扁平化
 *    后本区无自绘底），pointer-events:none 不挡点击/滚轮。G17 语义=「暗示可滚」不是「遮数据」。
 *  · 检测时点：onMounted + window resize 监听（onUnmounted 清理）+ watch(topoNodesEl)——
 *    shards 异步到达晚于 onMounted（v-if 此时未挂绑），ref 挂绑即补检，否则首屏判定恒 false。
 *
 * 挂载骨架照抄 adhocProgressUi565（api mock + createApp + pinia + memory router；项目不依赖
 * @vue/test-utils，monitorHistoryPanel 先例「OverviewView 全量挂载过重」由 api 全桩化解）。
 * 布局宽度走 Element.prototype scrollWidth/clientWidth 定向桩（happy-dom 恒 0，589 先例同源）。
 * 家族复跑（'ov-topo' × 'OverviewView' 交集全列）：flattenWave554 / cardPrimitiveVerdict547 /
 * paneShellWave547 / overviewA11y369 / overviewPolish634。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const MOCK_SHARDS = Array.from({ length: 8 }, (_, i) => ({
  node: 'es-node-' + i, state: 'STARTED', prirep: i % 2 ? 'r' : 'p',
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      setup: { ...orig.api?.setup, status: async () => ({ hostVisible: true }) },
      clusterIndices: async () => [],
      clustersList: async () => [],
      overview: async () => ({}),
      health: async () => ({}),
      clusterHealth: async () => ({}),
      shards: async () => MOCK_SHARDS,
      monitorHistory: async () => ({ records: [] }),
    },
  };
});

import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import OverviewView, { evalTopoClip } from '../views/OverviewView.vue';

const ov = readFileSync(join(__dirname, '../views/OverviewView.vue'), 'utf-8');
const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

/* ── 布局桩：happy-dom scrollWidth/clientWidth 恒 0（589 先例）→ 原型 getter 定向覆写，用后还原。
   两属性在 happy-dom 不同一层（scrollWidth=Element.prototype / clientWidth=HTMLElement.prototype，
   查找序近者先命中）——按 owner 定向 patch，勿假定同层（681 实测先例） ── */
const dims = { sw: 0, cw: 0 };
let restoreFns: Array<() => void> = [];
function stubLayoutProp(prop: 'scrollWidth' | 'clientWidth') {
  const owner = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop) ? HTMLElement.prototype
    : Object.getOwnPropertyDescriptor(Element.prototype, prop) ? Element.prototype
    : HTMLElement.prototype;
  const orig = Object.getOwnPropertyDescriptor(owner, prop);
  Object.defineProperty(owner, prop, {
    configurable: true,
    get: () => (prop === 'scrollWidth' ? dims.sw : dims.cw),
  });
  restoreFns.push(() => {
    if (orig) Object.defineProperty(owner, prop, orig);
    else delete (owner as any)[prop];
  });
}
const stubScrollDims = (sw: number, cw: number) => { dims.sw = sw; dims.cw = cw; };

beforeEach(() => {
  restoreFns = [];
  stubLayoutProp('scrollWidth');
  stubLayoutProp('clientWidth');
  stubScrollDims(0, 0);
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  /* 先卸 app（DOM 在位时走完整 onUnmounted 清理路径），再还原桩、清 DOM——
     不卸会跨用例泄漏 window resize 监听（顺序耦合隐患） */
  liveApps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  liveApps.length = 0;
  restoreFns.forEach(f => f());
  restoreFns = [];
  document.body.innerHTML = '';
});

const liveApps: ReturnType<typeof createApp>[] = [];
async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(OverviewView) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  liveApps.push(app);
  await settle();
  return { app, host };
}

describe('681 批 G17：evalTopoClip 纯函数（+1 容差语义）', () => {
  it('sw 明显大于 cw → true（放不下，可滚）', () => {
    expect(evalTopoClip(501, 300)).toBe(true);
  });

  it('sw == cw → false（放得下）', () => {
    expect(evalTopoClip(300, 300)).toBe(false);
  });

  it('sw = cw + 1 → false（+1 容差：取整抖动不误报）', () => {
    expect(evalTopoClip(301, 300)).toBe(false);
  });
});

describe('681 批 G17：topoClip 接线（真挂载，fade 元素在场性）', () => {
  it('溢出（sw>cw+1）→ .ov-topo-fade 在场：v-if 真元素 + aria-hidden + 锚在节点条包裹层', async () => {
    stubScrollDims(501, 300);
    const { host } = await mountView();
    const fade = host.querySelector('.ov-topo-fade');
    expect(fade, '溢出时渐隐提示在场').toBeTruthy();
    expect(fade?.getAttribute('aria-hidden')).toBe('true');
    expect(fade?.closest('.ov-topo-nodes-wrap'), 'fade 锚在节点条包裹层（不压 KPI）').toBeTruthy();
  });

  it('放得下（sw<=cw+1）→ 不在场（G17=暗示，非常态遮挡）', async () => {
    stubScrollDims(300, 300);
    const { host } = await mountView();
    expect(host.querySelector('.ov-topo-fade')).toBeNull();
  });

  it('resize 监听双向接线：由放得下转溢出现身、回放得下移除', async () => {
    stubScrollDims(300, 300);
    const { host } = await mountView();
    expect(host.querySelector('.ov-topo-fade')).toBeNull();
    stubScrollDims(501, 300);
    window.dispatchEvent(new Event('resize'));
    await settle();
    expect(host.querySelector('.ov-topo-fade'), '转溢出后 resize 触发出场').toBeTruthy();
    stubScrollDims(300, 300);
    window.dispatchEvent(new Event('resize'));
    await settle();
    expect(host.querySelector('.ov-topo-fade'), '回放得下后移除').toBeNull();
  });

  it('卸载清理：unmount 后 resize 不再触达（无异常即过）+ 移除监听源码锚在场', async () => {
    stubScrollDims(300, 300);
    const { app, host } = await mountView();
    app.unmount();
    stubScrollDims(501, 300);
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
    await settle();
    expect(host.querySelector('.ov-topo-fade')).toBeNull();
    expect(ov, 'resize 监听卸载清理在场').toContain("window.removeEventListener('resize', syncTopoClip)");
  });
});

describe('681 批 G17：结构锁（源码锚，家族 spec 同语言）', () => {
  it('fade 为真元素 v-if 档（勿 ::after——可测性优先）', () => {
    expect(ov).toContain('<span v-if="topoClip" class="ov-topo-fade" aria-hidden="true"></span>');
  });

  it('检测接线：resize 挂监听 + onUnmounted 清理 + 异步到达补检（watch topoNodesEl）', () => {
    expect(ov).toContain("window.addEventListener('resize', syncTopoClip)");
    expect(ov).toMatch(/onUnmounted\(/);
    expect(ov).toMatch(/watch\(topoNodesEl/);
  });

  it('纯函数单源导出（<script setup> 不能具名导出，SFC 双块惯例）', () => {
    expect(ov).toMatch(/export function evalTopoClip\(sw: number, cw: number\): boolean/);
    expect(ov).toMatch(/return sw > cw \+ 1;/);
  });

  it('fade 形态：pointer-events:none + 右缘渐变 + 40px（暗示非遮挡）', () => {
    expect(ov).toMatch(/\.ov-topo-fade \{[^}]*pointer-events: none;/);
    expect(ov).toMatch(/\.ov-topo-fade \{[^}]*linear-gradient\(to right, transparent, var\(--bg0\)\)/);
    expect(ov).toMatch(/\.ov-topo-fade \{[^}]*width: 40px;/);
  });
});
