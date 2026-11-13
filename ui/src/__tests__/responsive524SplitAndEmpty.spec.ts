/**
 * 五百二十四批（W3）：响应式合并守卫——SplitHandle 双栏拖拽推广 + 空态合并 + vh 弹性档。
 *   ① TemplatesView：列表/编辑器分栏 SplitHandle+usePref（templates.leftW，0=自动
 *      minmax(280px,380px)）、窄屏 .tv2-editor 480px 定高改 vh 弹性档、模板名 datalist
 *      合并 usePopupList 轻量形态（挂载验证候选渲染与点选回填）；
 *   ② TaskTreeView：任务列表/详情分栏 SplitHandle+usePref（tasktree.leftW；不碰 ?taskId=
 *      深链消费与过滤逻辑）；空态多分支 EmptyState compact（文案逐字保留——clusterThreeState
 *      挂载锁口径；加载骨架分支保留 tt-empty 原样，ilmEmpty307 字面锁不迁）；
 *   ③ RankDebugView .rd-tree 480px→max(280px, 42vh) 弹性档；
 *   ④ ConfigValidatorView importIndex 接 useIdxState（写类页无 follow，521 归并批口径）
 *      + .cv-iss-sev 字重 700→650。
 * 全局三锚（弹窗 max-width / --vh-offset / split 窄屏堆叠）在 responsiveGuard239.spec.ts。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const tpl = read('../views/TemplatesView.vue');
const tt = read('../views/TaskTreeView.vue');
const rd = read('../views/RankDebugView.vue');
const cv = read('../views/ConfigValidatorView.vue');

/* 只替换网络出口，视图/组件/工具全用真的 */
const tasksFn = vi.fn();
const templatesFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterTasks: (...args: any[]) => tasksFn(...args),
      templates: (...args: any[]) => templatesFn(...args),
    },
  };
});

/* 挂载设施：MonacoEditor stub（configValidatorAdjustW2/monacoAssistAttach 既有范式）——
   TemplatesView 的 JsonArea 内部经 MonacoEditor 组件，happy-dom 下真实 monaco 初始化
   会在 canvas 2d context 炸（webkitBackingStorePixelRatio），stub 掉与被测语义无关 */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import TaskTreeView from '../views/TaskTreeView.vue';
import TemplatesView from '../views/TemplatesView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any, hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  tasksFn.mockReset();
  templatesFn.mockReset();
});

describe('524 批：TemplatesView 分栏拖拽 + datalist 合并', () => {
  it('源码锁：SplitHandle 接线 --tv2-left-w + usePref，窄屏柄隐藏 + 编辑器 vh 弹性档', () => {
    expect(tpl).toContain('grid-template-columns: var(--tv2-left-w, minmax(280px, 380px)) 11px minmax(0, 1fr)');
    expect(tpl).toContain("const tv2LeftW = usePref('templates.leftW', 0);");
    expect(tpl).toContain('<SplitHandle axis="vertical"');
    expect(tpl).toMatch(/@media \(max-width: 1100px\) \{[\s\S]*?\.tv2-split \{ display: none; \}/);
    expect(tpl).toMatch(/\.tv2-editor \{ height: max\(480px, 42vh\); \}/);
    /* 原生 datalist 与 list 属性退役（键盘导航/aria 语义由 usePopupList 骨架承担） */
    expect(tpl).not.toMatch(/<datalist[\s>]/);
    expect(tpl).not.toContain('list="tv2-names"');
  });

  it('模板名候选下拉：挂载点「新建」→ 候选渲染 → 点选回填输入框', async () => {
    templatesFn.mockResolvedValue({
      legacy: false,
      index_templates: [{ name: 'logs-a', index_template: {} }, { name: 'logs-b', index_template: {} }],
      component_templates: [],
    });
    const { app, host } = await mountView(TemplatesView);
    const newBtn = [...host.querySelectorAll('button')].find(b => b.textContent!.includes('新建'));
    expect(newBtn, 'ops 权限下新建按钮必须渲染').toBeTruthy();
    (newBtn as HTMLButtonElement).click();
    await settle();
    const inp = host.querySelector<HTMLInputElement>('.tv2-nm-wrap input');
    expect(inp, 'usePopupList 化的名称输入框在场').toBeTruthy();
    inp!.focus();
    await settle();
    const items = [...host.querySelectorAll('.tv2-nm-item')];
    expect(items.map(i => i.textContent)).toEqual(['logs-a', 'logs-b']);
    (items[1] as HTMLElement).click();
    await settle();
    expect(inp!.value, '点选候选回填名称输入框').toBe('logs-b');
    app.unmount();
  });
});

describe('524 批：TaskTreeView 分栏拖拽 + 空态 EmptyState compact', () => {
  it('源码锁：SplitHandle 接线 --tt-left-w + usePref，窄屏柄隐藏；?taskId 深链消费原样在场', () => {
    expect(tt).toContain('grid-template-columns: var(--tt-left-w, 1fr) 11px minmax(0, 1fr)');
    expect(tt).toContain("const ttLeftW = usePref('tasktree.leftW', 0);");
    expect(tt).toContain('<SplitHandle axis="vertical"');
    expect(tt).toMatch(/@media \(max-width: 1100px\) \{[\s\S]*?\.tt-split \{ display: none; \}/);
    expect(tt).toMatch(/route\.query\.taskId/);
  });

  it('真空态 EmptyState compact：「无任务」在 .empty-state 内；分栏柄渲染在场', async () => {
    tasksFn.mockResolvedValue([]);
    const { app, host } = await mountView(TaskTreeView);
    const empty = host.querySelector('.tt-left .empty-state');
    expect(empty, '真空态走 EmptyState compact').toBeTruthy();
    expect(empty!.classList.contains('es-compact')).toBe(true);
    expect(empty!.textContent).toContain('无任务');
    expect(host.querySelector('.tt-split'), '中缝拖拽柄渲染在场').toBeTruthy();
    app.unmount();
  });

  it('过滤致空：文案 + 清除过滤钮在，点击恢复任务树渲染', async () => {
    tasksFn.mockResolvedValue([{
      taskId: 'node-es-01:1', action: 'indices:data/write/reindex', node: 'node-es-01',
      description: 'reindex', runningTimeNanos: 1_000_000_000, cancellable: true,
    }]);
    sessionStorage.setItem('esquerystudio.draft2:task-tree:host:-:-:filter', 'zzz_no_match');
    const { app, host } = await mountView(TaskTreeView);
    const empty = host.querySelector('.tt-left .empty-state');
    expect(empty, '过滤致空走 EmptyState compact').toBeTruthy();
    expect(empty!.textContent).toContain('无匹配任务');
    const clearBtn = [...host.querySelectorAll('.tt-left .empty-state button')]
      .find(b => b.textContent!.includes('清除过滤'));
    expect(clearBtn, 'actionText 清除过滤钮在').toBeTruthy();
    (clearBtn as HTMLButtonElement).click();
    await settle();
    expect(host.querySelector('.tt-left .empty-state'), '清除过滤后空态消隐').toBeNull();
    expect(host.querySelector('.tr-act'), '任务树恢复渲染').toBeTruthy();
    app.unmount();
  });
});

describe('524 批：RankDebug / ConfigValidator 合并', () => {
  it('RankDebug .rd-tree 定高改 max(280px, 42vh) 弹性档（528 批同步更新：padding 8px 合并 var(--sp-2) 兼容形态）', () => {
    expect(rd).toMatch(/\.rd-tree \{ padding: (?:8px|var\(--sp-2\)); max-height: max\(280px, 42vh\); overflow: auto; \}/);
  });

  it('ConfigValidator importIndex 接 useIdxState（写类页无 follow）+ sev 徽标改用（525 批同步更新；531 批再收 StatusPill）', () => {
    expect(cv).toContain('const importIndex = useIdxState();');
    expect(cv).toMatch(/import \{ usePref, useIdxState \} from '\.\.\/composables\/urlState';/);
    /* 525 批同步更新：.cv-iss-sev 改用全局 .pill 语义档后瘦身为布局壳（字号/字重形态归 .pill 单一出处），
       原「font-weight: 650 字重锁」随形态上收退役，改锁改用形态与壳不回潮。
       五百三十一批锚同步更新：severity 裸英文枚举再收 StatusPill+sevZh（中文标签），tone 档仍走
       同源 cvSevPill（=esEnumZh.sevPill），裸 pill 字面拼接不回潮 */
    expect(cv).toMatch(/<StatusPill class="cv-iss-sev" :tone="cvSevPill\(/);
    expect(cv).toMatch(/:label="cvSevZh\(iss\.severity\)"/);
    expect(cv).toMatch(/\.cv-iss-sev \{ flex-shrink: 0; margin-top: 1px; \}/);
    expect(cv, 'sev 三档本地配色不回潮').not.toMatch(/\.cv-iss-sev\.[a-z]+ \{[^}]*background/);
  });
});
