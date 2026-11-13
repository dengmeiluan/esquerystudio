import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../../components/WorkbenchLayout.vue';

/* 七百二十三批 G78（R103 裁决表头号·P1 布局断裂）：≤1100 堆叠视口挂载（直开/SPA 重挂）
   sized query pane 塌 122px+JsonArea 31px 单行——stacked 下 .wl-body 转 column，
   sized pane flex:0 0 auto 高度按 min-content，而 pane 内容高度链（.rp-left height:100%
   → JsonArea fill Monaco height:100%）依赖 pane 确定高度 → 循环塌缩；flex pane
   flex:1 1 0 吞掉全部剩余。修法=stacked+vertical 轴 sized pane 内联高度保底
   （height=当前尺寸值/minHeight=声明 min），flex pane 维持吞剩余既有语义。 */

const PANES = [
  { id: 'query', role: 'request', minSize: 300, defaultSize: 420, collapsible: true },
  { id: 'result', role: 'response', minSize: 360, defaultSize: 'flex' as const },
];

let app: App | null = null;
let host: HTMLDivElement | null = null;
const origGBCR = Element.prototype.getBoundingClientRect;

function mountWorkbench(options: { profile?: 'embedded' | 'standard'; panes?: WorkbenchPaneSpec[]; axis?: 'horizontal' | 'vertical' } = {}) {
  const panes = options.panes ?? PANES;
  const profile = options.profile ?? 'embedded';
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({
    setup() {
      return () => h(WorkbenchLayout, {
        scope: { target: 'qa', route: '/reindex-preview', mode: 'reindexPreview', profile },
        panes, profile, axis: options.axis ?? 'vertical',
      }, Object.fromEntries(panes.map(p => [`pane-${p.id}`, () => h('div', `content-${p.id}`)])));
    },
  });
  app.config.warnHandler = () => {};
  app.mount(host);
  return host!;
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
});

describe('workbench stacked pane height floor (723 G78)', () => {
  it('stacked vertical sized pane carries inline height floor from its size (G78)', async () => {
    const host = mountWorkbench({ profile: 'embedded' });
    await nextTick();
    expect(host.querySelector('.wl')!.classList.contains('stacked')).toBe(true);
    const q = host.querySelector('[data-pane-id="query"]') as HTMLElement;
    expect(q.style.height).toBe('420px');
    expect(q.style.minHeight).toBe('300px');
  });

  it('stacked vertical sized pane honours a persisted size as its height floor', async () => {
    localStorage.setItem('esquerystudio.layout.v2:qa:/reindex-preview:reindexPreview:embedded', JSON.stringify({
      version: 1, updatedAt: Date.now(), panes: { query: { size: 600 } },
    }));
    const host = mountWorkbench({ profile: 'embedded' });
    await nextTick();
    expect((host.querySelector('[data-pane-id="query"]') as HTMLElement).style.height).toBe('600px');
  });

  it('stacked vertical collapsed/hidden sized pane keeps no height floor', async () => {
    localStorage.setItem('esquerystudio.layout.v2:qa:/reindex-preview:reindexPreview:embedded', JSON.stringify({
      version: 1, updatedAt: Date.now(), panes: { query: { size: 420, collapsed: true } },
    }));
    const host = mountWorkbench({ profile: 'embedded' });
    await nextTick();
    expect((host.querySelector('[data-pane-id="query"]') as HTMLElement).style.height).toBe('');
  });

  it('stacked vertical flex pane gets no fixed height (keeps absorbing remainder)', async () => {
    const host = mountWorkbench({ profile: 'embedded' });
    await nextTick();
    const r = host.querySelector('[data-pane-id="result"]') as HTMLElement;
    expect(r.classList.contains('wl-flex-pane')).toBe(true);
    expect(r.style.height).toBe('');
  });

  it('non-stacked vertical sized pane carries no stacked height floor (zero drift)', async () => {
    const host = mountWorkbench({ profile: 'standard' });
    await nextTick();
    expect(host.querySelector('.wl')!.classList.contains('stacked')).toBe(false);
    expect((host.querySelector('[data-pane-id="query"]') as HTMLElement).style.height).toBe('');
  });
});
