import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../../components/WorkbenchLayout.vue';
import FocusableSurface from '../../components/FocusableSurface.vue';

/* P1 workbench（plan Task 4）：尺寸受控、预设不改路由、embedded 堆叠、聚焦/Esc/焦点恢复。
   available 用 getBoundingClientRect 原型伪造（happy-dom 无真布局）。 */

const TWO_PANES = [
  { id: 'request', role: 'request', axis: 'vertical' as const, minSize: 240, defaultSize: 360 },
  { id: 'response', role: 'response', axis: 'vertical' as const, minSize: 240, defaultSize: 420 },
];

let app: App | null = null;
let host: HTMLDivElement | null = null;
const origGBCR = Element.prototype.getBoundingClientRect;

function mountWorkbench(options: { profile?: 'embedded' | 'compact' | 'standard' | 'wide'; panes?: WorkbenchPaneSpec[]; axis?: 'horizontal' | 'vertical'; withFocus?: boolean } = {}) {
  const panes = options.panes ?? TWO_PANES;
  const profile = options.profile ?? 'standard';
  const focusState = reactive<Record<string, boolean>>({});
  const trigger = document.createElement('button');
  trigger.textContent = '外部触发';
  document.body.appendChild(trigger);
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({
    setup() {
      return () => h(WorkbenchLayout, {
        scope: { target: 'qa', route: '/devtools', mode: 'search', profile },
        panes, profile, axis: options.axis ?? 'vertical',
      }, Object.fromEntries(panes.map(p => [`pane-${p.id}`, () => h(FocusableSurface, {
        paneId: p.id, title: p.id, enabled: !!focusState[p.id],
        'onUpdate:enabled': (v: boolean) => { focusState[p.id] = v; },
      }, { default: () => h('div', `content-${p.id}`) })])));
    },
  });
  app.config.warnHandler = () => {};
  app.mount(host);
  return { host: host!, trigger, panes };
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.getBoundingClientRect = function () {
    return { width: 1000, height: 700, top: 0, left: 0, right: 1000, bottom: 700, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  } as typeof origGBCR;
  window.innerWidth = 1440;
  window.innerHeight = 900;
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = origGBCR;
  app?.unmount();
  host?.remove();
  document.body.innerHTML = '';
  localStorage.clear();
  document.body.style.overflow = '';
});

describe('WorkbenchLayout + FocusableSurface', () => {
  it('renders pane sizes from specs and keeps every pane above min', async () => {
    const { host } = mountWorkbench();
    await nextTick();
    const req = host.querySelector('[data-pane-id="request"]');
    expect(req).toBeTruthy();
    expect(Number(req!.getAttribute('data-pane-size'))).toBeGreaterThanOrEqual(240);
    expect(host.querySelector('[data-pane-id="response"]')).toBeTruthy();
  });

  it('applies equal preset without changing route state', async () => {
    location.hash = '#/devtools';
    const before = location.hash;
    const { host } = mountWorkbench();
    await nextTick();
    host.querySelector('[data-layout-preset="equal"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(location.hash).toBe(before);
    expect(host.querySelector('[data-pane-id="request"]')?.getAttribute('data-pane-size')).toBe('500');
  });

  it('switches embedded profile to stacked layout', async () => {
    const { host } = mountWorkbench({ profile: 'embedded' });
    await nextTick();
    expect(host.querySelector('.wl')!.classList.contains('stacked')).toBe(true);
    expect(host.querySelectorAll('[role="separator"]').length).toBe(0);
  });

  it('focuses a pane, exits on Escape and restores the trigger focus', async () => {
    const { host, trigger } = mountWorkbench();
    await nextTick();
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    host.querySelector('[data-focus-pane="response"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    await nextTick();
    expect(document.querySelector('[data-focused-pane="response"]')).toBeTruthy();
    expect(document.querySelector('[data-focused-pane="response"]')?.getAttribute('role')).toBe('dialog');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    await nextTick();
    expect(document.querySelector('[data-focused-pane="response"]')).toBeFalsy();
    expect(document.activeElement).toBe(trigger);
  });

  it('restores a persisted pane size after remount', async () => {
    localStorage.setItem('esquerystudio.layout.v2:qa:/devtools:search:standard', JSON.stringify({
      version: 1, updatedAt: Date.now(), panes: { response: { size: 600 } },
    }));
    const { host } = mountWorkbench();
    await nextTick();
    expect(host.querySelector('[data-pane-id="response"]')?.getAttribute('data-pane-size')).toBe('600');
  });

  it('flex pane carries no fixed width and sizing prefs ignore it', async () => {
    const panes = [
      { id: 'tree', role: 'tree', minSize: 200, defaultSize: 300 },
      { id: 'workspace', role: 'workspace', minSize: 200, defaultSize: 'flex' as const },
    ];
    const { host } = mountWorkbench({ panes });
    await nextTick();
    const flex = host.querySelector('[data-pane-id="workspace"]');
    expect(flex?.classList.contains('wl-flex-pane')).toBe(true);
  });

  /* BUG：sized pane（max:'available'）的 restore/preset/拖拽上界从不为兄弟保留 min，
     localStorage 里一个大值就能把 flex 的编辑器 pane 挤到 0 宽——查询工作台右侧
     语法渲染整块消失的根因。上界必须 = available − 其余 pane minSize 之和。 */
  it('sized pane restore/preset never squeezes siblings below their min', async () => {
    const panes = [
      { id: 'tree', role: 'tree', minSize: 320, defaultSize: 560, maxSize: 'available' as const, collapsible: true },
      { id: 'workspace', role: 'workspace', minSize: 360, defaultSize: 'flex' as const },
    ];
    localStorage.setItem('esquerystudio.layout.v2:qa:/devtools:search:standard', JSON.stringify({
      version: 1, updatedAt: Date.now(), panes: { tree: { size: 1000 } },
    }));
    const { host } = mountWorkbench({ panes });
    await nextTick();
    expect(Number(host.querySelector('[data-pane-id="tree"]')?.getAttribute('data-pane-size')))
      .toBeLessThanOrEqual(1000 - 360);
  });

  it('editor-first preset leaves the flex pane its min width', async () => {
    const panes = [
      { id: 'tree', role: 'tree', minSize: 320, defaultSize: 560, maxSize: 'available' as const, collapsible: true },
      { id: 'aux', role: 'aux', minSize: 240, defaultSize: 300 },
      { id: 'workspace', role: 'workspace', minSize: 360, defaultSize: 'flex' as const },
    ];
    const { host } = mountWorkbench({ panes });
    await nextTick();
    host.querySelector('[data-layout-preset="editor-first"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(Number(host.querySelector('[data-pane-id="tree"]')?.getAttribute('data-pane-size')))
      .toBeLessThanOrEqual(1000 - 240 - 360);
    /* 五百一十九批：单点上限不够——sized 合计也必须为 flex 保留 min（此前 tree+aux 可吃到 720，
       flex 编辑器只剩 280 < min 360） */
    const sizedTotal = ['tree', 'aux'].reduce((sum, id) => (
      sum + Number(host.querySelector(`[data-pane-id="${id}"]`)?.getAttribute('data-pane-size') ?? 0)
    ), 0);
    expect(sizedTotal).toBeLessThanOrEqual(1000 - 360);
  });

  /* 五百一十九批：last 判定修复——[sized,flex] 双栏的 sized pane 必须渲染拖拽柄
     （此前 isLastSized 把后随 flex 过滤掉误判「最后一个」，10 个视图 0 柄、用户实报「无法调节」） */
  it('renders the split-handle on a sized pane followed by a flex pane', async () => {
    const panes = [
      { id: 'tree', role: 'tree', minSize: 200, defaultSize: 300 },
      { id: 'workspace', role: 'workspace', minSize: 200, defaultSize: 'flex' as const },
    ];
    const { host } = mountWorkbench({ panes });
    await nextTick();
    expect(host.querySelector('[data-pane-id="tree"] [role="separator"]')).toBeTruthy();
    expect(host.querySelector('[data-pane-id="workspace"] [role="separator"]')).toBeFalsy();
    expect(host.querySelectorAll('[role="separator"]').length).toBe(1);
  });

  it('keeps stacked layouts free of split-handles even with flex siblings', async () => {
    const panes = [
      { id: 'tree', role: 'tree', minSize: 200, defaultSize: 300 },
      { id: 'workspace', role: 'workspace', minSize: 200, defaultSize: 'flex' as const },
    ];
    const { host } = mountWorkbench({ panes, profile: 'embedded' });
    await nextTick();
    expect(host.querySelectorAll('[role="separator"]').length).toBe(0);
  });

  /* 五百一十九批：折叠态恢复——偏好快照里的 collapsed 此前从不回放，折叠后刷新/切页回来即丢 */
  it('restores persisted collapsed state on mount', async () => {
    const panes = [
      { id: 'request', role: 'request', minSize: 240, defaultSize: 360, collapsible: true },
      { id: 'response', role: 'response', minSize: 240, defaultSize: 420, collapsible: true },
    ];
    localStorage.setItem('esquerystudio.layout.v2:qa:/devtools:search:standard', JSON.stringify({
      version: 1, updatedAt: Date.now(), panes: { request: { size: 360, collapsed: true } },
    }));
    const { host } = mountWorkbench({ panes });
    await nextTick();
    expect(host.querySelector('[data-pane-id="request"]')!.classList.contains('collapsed')).toBe(true);
    expect(host.querySelector('[data-pane-id="response"]')!.classList.contains('collapsed')).toBe(false);
  });

  /* 五百一十九批：结果优先反向语义——存在 flex pane 时 sized 压向 min，空间让给 flex */
  it('result-first preset presses sized panes to min when a flex pane exists', async () => {
    const panes = [
      { id: 'tree', role: 'tree', minSize: 320, defaultSize: 560, maxSize: 'available' as const },
      { id: 'aux', role: 'aux', minSize: 240, defaultSize: 300 },
      { id: 'workspace', role: 'workspace', minSize: 360, defaultSize: 'flex' as const },
    ];
    const { host } = mountWorkbench({ panes });
    await nextTick();
    host.querySelector('[data-layout-preset="result-first"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(host.querySelector('[data-pane-id="tree"]')?.getAttribute('data-pane-size')).toBe('320');
    expect(host.querySelector('[data-pane-id="aux"]')?.getAttribute('data-pane-size')).toBe('240');
  });
});
