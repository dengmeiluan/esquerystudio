/* 1087 批组件契约：DSL 构造器「编辑器」族 5 文件的模板层文本输入统一收敛 TextInput
 * （RootExtrasPane 14 处 / GeoValueEditor 模板层 5 处 / IntervalsEditor 2 处 /
 *   MltLikeEditor 1 处 / FsFunctionsPanel 5 处；GeoValueEditor render 函数区 2 处
 *   已由 1085 批收敛并锁定，本批不动）。锁面三层：
 *   ① 源码级：5 文件不再出现模板层原生 <input>；收敛点位数不缩水；
 *   ② 挂载级：每文件至少 1 例——皮肤锚类与 placeholder 落真实 input（既有测试选择器
 *      零漂移），输入经 update:modelValue 写回数据流（change/keydown 原生透传位保持）；
 *   ③ 样式级：定宽/flex 预算打输入件根容器（.ti:has(锚类)），高度/字号经 :deep 落
 *      真实 input（RestView 1085 批同款手法）。 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mappingDetailFn = vi.fn();
vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
    },
  };
});

import RootExtrasPane from '../builder/RootExtrasPane.vue';
import GeoValueEditor from '../builder/GeoValueEditor.vue';
import IntervalsEditor from '../builder/IntervalsEditor.vue';
import MltLikeEditor from '../builder/MltLikeEditor.vue';
import FsFunctionsPanel from '../builder/FsFunctionsPanel.vue';
import { vTip } from '../../directives/vTip';
import { __clearFieldCache } from '../../composables/useIndexFields';
import { parseTree } from '../../utils/queryAst';
import type { QueryTree } from '../../utils/queryAst';
import { makeRule } from '../../utils/intervalsRule';

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
const tick = () => new Promise(r => setTimeout(r));
const apps: App[] = [];

function mountAt(render: () => ReturnType<typeof h>, withPinia = false) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render });
  app.directive('tip', vTip);
  if (withPinia) app.use(createPinia());
  apps.push(app);
  app.mount(host);
  return { host, app };
}

function mountPane(tree: QueryTree) {
  const cur = ref(tree);
  const { host } = mountAt(() => h(RootExtrasPane, {
    tree: cur.value, fields: ['status', 'likes'], types: { status: 'keyword', likes: 'integer' },
    index: '', 'onUpdate:tree': (t: QueryTree) => { cur.value = t; },
  }), true);
  return { host, cur };
}

function mountGeo(op: string, value: unknown, params: Record<string, unknown> = {}) {
  const cur = ref<{ value?: unknown; params?: Record<string, unknown> }>({});
  const { host } = mountAt(() => h(GeoValueEditor, {
    op, value, params, onPatch: (p: { value?: unknown; params?: Record<string, unknown> }) => { cur.value = p; },
  }));
  return { host, cur };
}

function mountIvr() {
  const cur = ref(makeRule('match'));
  const { host } = mountAt(() => h(IntervalsEditor, {
    rule: cur.value, onUpdate: (r: typeof cur.value) => { cur.value = r; },
  }));
  return { host, cur };
}

function mountMlt(value: unknown) {
  const cur = ref<unknown>(value);
  const { host } = mountAt(() => h(MltLikeEditor, {
    value: cur.value, onUpdate: (v: unknown) => { cur.value = v; },
  }));
  return { host, cur };
}

function mountFsfn(params: Record<string, unknown>) {
  const cur = ref(params);
  const { host } = mountAt(() => h(FsFunctionsPanel, {
    params: cur.value as Record<string, unknown>, fields: ['likes'], types: { likes: 'long' },
    onUpdate: (p: Record<string, unknown>) => { cur.value = p; },
  }));
  return { host, cur };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue({ raw: { properties: { status: { type: 'keyword' } } } });
});
afterEach(() => { apps.splice(0).forEach(a => a.unmount()); });

const NO_BARE_INPUT = /<input(?![^>]*type="file")[\s>]/;
const FILES = [
  'builder/RootExtrasPane.vue',
  'builder/GeoValueEditor.vue',
  'builder/IntervalsEditor.vue',
  'builder/MltLikeEditor.vue',
  'builder/FsFunctionsPanel.vue',
] as const;

describe('1087 · 编辑器族源码锁', () => {
  it('5 文件模板层原生 input 清零，收敛点位不缩水', () => {
    for (const f of FILES) {
      expect(srcOf(f), `${f} 不应再有模板层原生 input`).not.toMatch(NO_BARE_INPUT);
    }
    const rx = srcOf('builder/RootExtrasPane.vue');
    expect((rx.match(/<TextInput/g) || []).length, 'RootExtrasPane 14 处收敛点位').toBeGreaterThanOrEqual(14);
    for (const anchor of ['includes 通配，逗号分隔', '建议名', '如 10', '所有建议项共享', 'query_vector JSON']) {
      expect(rx, `placeholder 锚 ${anchor} 在场`).toContain(anchor);
    }
  });

  it('定宽/flex 预算落输入件根容器，高度字号经 :deep 落真实 input（RestView 同款手法）', () => {
    expect(srcOf('builder/RootExtrasPane.vue')).toMatch(/\.rx-row > \.ti:has\(\.rx-knn-vec\) \{ flex: 1 1 200px; min-width: 0; \}/);
    expect(srcOf('builder/RootExtrasPane.vue')).toMatch(/\.rx :deep\(\.rx-knn-vec\) \{ font-size: var\(--fs-xs\); \}/);
    expect(srcOf('builder/RootExtrasPane.vue')).toMatch(/\.rx-qp-row :deep\(\.rx-qp-json\.bad\)/);
    expect(srcOf('builder/GeoValueEditor.vue')).toMatch(/\.gve :deep\(\.gve-dist\) \{ width: 96px;/);
    expect(srcOf('builder/IntervalsEditor.vue')).toMatch(/\.ivr-hd > \.ti:has\(\.ivr-name\)/);
    expect(srcOf('builder/MltLikeEditor.vue')).toMatch(/\.mlt-chips > \.ti:has\(\.mlt-in\)/);
    expect(srcOf('builder/FsFunctionsPanel.vue')).toMatch(/\.fsfn-decay :deep\(\.fsfn-dp\) \{ width: 132px;/);
  });
});

describe('1087 · 挂载级行为锁（每文件至少 1 例）', () => {
  it('RootExtrasPane：suggest 名称/text 编辑写回（锚类落真实 input，输入件根 .ti 承载）', async () => {
    const t = parseTree({ suggest: { my: { text: 'tw', term: { field: 'body' } } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mountPane(t.tree);
    await tick();
    const name = host.querySelector<HTMLInputElement>('.rx-sug-name')!;
    expect(name, '皮肤锚类落真实 input（选择器零漂移）').toBeTruthy();
    expect(name.closest('.ti'), '输入件根容器承载').not.toBeNull();
    expect(name.placeholder).toBe('建议名');
    name.value = 'renamed';
    name.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.suggest!.items[0].name).toBe('renamed');
    const text = host.querySelector<HTMLInputElement>('.rx-sug-text')!;
    expect(text.closest('.ti')).not.toBeNull();
    text.value = 'newtext';
    text.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.suggest!.items[0].text).toBe('newtext');
  });

  it('GeoValueEditor：geo_bounding_box 四边（模板层收敛位）top 输入写回', async () => {
    const { host, cur } = mountGeo('geo_bounding_box', { top: 40, left: -70, right: -60, bottom: 30 });
    await tick();
    const tops = [...host.querySelectorAll<HTMLInputElement>('.gve-n')];
    expect(tops.length, '四边 4 输入（模板层 TextInput）').toBe(4);
    const top = tops[0];
    expect(top.value).toBe('40');
    expect(top.closest('.ti'), '输入件根容器承载').not.toBeNull();
    top.value = '41.5';
    top.dispatchEvent(new Event('input'));
    await tick();
    expect((cur.value.value as Record<string, unknown>).top).toBe(41.5);
  });

  it('IntervalsEditor：_name 输入写回 hasName/name；清空退役', async () => {
    const { host, cur } = mountIvr();
    await tick();
    const name = host.querySelector<HTMLInputElement>('.ivr-name')!;
    expect(name.closest('.ti')).not.toBeNull();
    name.value = 'nm1';
    name.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.hasName).toBe(true);
    expect(cur.value.name).toBe('nm1');
    name.value = '';
    name.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.hasName).toBe(false);
  });

  it('MltLikeEditor：like 数组回车追加文本项（keydown.enter 通道透传不漂移）', async () => {
    const { host, cur } = mountMlt(['free text']);
    await tick();
    const inp = host.querySelector<HTMLInputElement>('.mlt-in')!;
    expect(inp.closest('.ti')).not.toBeNull();
    inp.value = 'bike';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    expect(cur.value).toEqual(['free text', 'bike']);
  });

  it('FsFunctionsPanel：weight 编辑数字写回、清空删键（容错解析语义不变）', async () => {
    const { host, cur } = mountFsfn({ functions: [{ weight: 2 }] });
    await tick();
    const w = host.querySelector<HTMLInputElement>('.fsfn-w')!;
    expect(w.value).toBe('2');
    expect(w.closest('.ti')).not.toBeNull();
    w.value = '7';
    w.dispatchEvent(new Event('input'));
    await tick();
    expect((cur.value.functions as Record<string, unknown>[])[0].weight).toBe(7);
    w.value = '';
    w.dispatchEvent(new Event('input'));
    await tick();
    expect('weight' in (cur.value.functions as Record<string, unknown>[])[0]).toBe(false);
  });
});
