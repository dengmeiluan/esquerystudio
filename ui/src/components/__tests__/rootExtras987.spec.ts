/* 987 批：顶层键一等公民化组件契约——post_filter 树编辑（MiniTreeEditor 承载）、
   collapse 结构化编辑、knn 向量 JSON 编辑。chips 序位锁面（rootExtras.spec）：
   排序[0]/_source[1]/高亮[2]/聚合[3] 之后追加三 chip，extras 殿后。 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, ref, type App } from 'vue';
import { createPinia } from 'pinia';

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
import { __clearFieldCache } from '../../composables/useIndexFields';
import { emptyTree, parseTree, serializeTree, type QueryTree } from '../../utils/queryAst';

const apps: App[] = [];

function mount(tree: QueryTree) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(tree);
  const app = createApp({
    render: () => h(RootExtrasPane, {
      tree: cur.value,
      fields: ['status', 'user', 'vec'], types: { status: 'keyword', user: 'keyword', vec: 'dense_vector' },
      index: '',
      'onUpdate:tree': (t: QueryTree) => { cur.value = t; },
    }),
  });
  apps.push(app);
  app.use(createPinia());
  app.mount(host);
  return { host, cur };
}

const tick = () => new Promise(r => setTimeout(r));

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue({ raw: { properties: { status: { type: 'keyword' } } } });
});
afterEach(() => { apps.splice(0).forEach(a => a.unmount()); });

describe('987 post_filter 一等编辑', () => {
  it('chip 在场且状态 pill 随树翻转；未设置点加钮 → bool must term 结构', async () => {
    const { host, cur } = mount(emptyTree());
    const chips = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')];
    const pfChip = chips.find(c => c.textContent?.includes('post_filter'));
    expect(pfChip, 'post_filter chip 必须在聚合之后').toBeTruthy();
    expect(pfChip!.textContent).toContain('未设置');
    pfChip!.click();
    await tick();
    (host.querySelector('.rx-pf-add') as HTMLElement).click();
    await tick();
    expect(cur.value.postFilter?.type).toBe('bool');
    expect(serializeTree(cur.value).post_filter).toEqual({ bool: { must: [{ term: { status: '' } }] } });
  });

  it('树编辑联动：改条件值写回 postFilter（MiniTreeEditor 树编辑器贯通）', async () => {
    const t = parseTree({ post_filter: { term: { status: 'active' } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mount(t.tree);
    await tick();
    const inp = host.querySelector('.rx-open .cn-val') as HTMLInputElement;
    expect(inp, '单条件 postFilter 直渲染条件行').toBeTruthy();
    inp.value = 'inactive';
    inp.dispatchEvent(new Event('input'));
    await tick();
    expect(serializeTree(cur.value).post_filter).toEqual({ term: { status: 'inactive' } });
  });

  it('带 postFilter 的树挂载即自动展开分区（autoOpen 初始化）；移除键后消失', async () => {
    const t = parseTree({ post_filter: { match_all: {} } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mount(t.tree);
    await tick();
    expect(host.querySelector('[title="移除 post_filter 键"]'), '有内容默认展开').not.toBeNull();
    (host.querySelector('[title="移除 post_filter 键"]') as HTMLElement).click();
    await tick();
    expect(cur.value.postFilter).toBeNull();
    expect(serializeTree(cur.value)).toEqual({});
  });

  it('bool 组 post_filter：组内删除子句回 match_all（root 永不缺失）', async () => {
    const t = parseTree({ post_filter: { bool: { must: [{ term: { a: 1 } }] } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mount(t.tree);
    await tick();
    (host.querySelector('.rx-open .cn button[aria-label="删除"]') as HTMLElement).click();
    await tick();
    expect(serializeTree(cur.value).post_filter).toEqual({ match_all: {} });
  });
});

describe('987 collapse 结构化编辑', () => {
  it('加折叠：field 取首字段，序列化 {field}', async () => {
    const { host, cur } = mount(emptyTree());
    const chip = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')].find(c => c.textContent?.includes('collapse'));
    chip!.click();
    await tick();
    (host.querySelector('.rx-col-add') as HTMLElement).click();
    await tick();
    expect(cur.value.collapse?.field).toBe('status');
    expect(serializeTree(cur.value).collapse).toEqual({ field: 'status' });
  });

  it('inner_hits 参数经 JSON 文本位编辑写回 params（1096 改型：保留数字）', async () => {
    const t = parseTree({ collapse: { field: 'user', inner_hits: { size: 3 } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mount(t.tree);
    await tick();
    (host.querySelector('[title="折叠参数（inner_hits…）"]') as HTMLElement).click();
    await tick();
    const val = host.querySelector('.rx-sub textarea.gp-json') as HTMLTextAreaElement;
    expect(val, 'inner_hits 走 JSON 文本位').toBeTruthy();
    val.value = '{"size": 5}';
    val.dispatchEvent(new Event('input'));
    await tick();
    expect(serializeTree(cur.value).collapse).toEqual({ field: 'user', inner_hits: { size: 5 } });
  });

  it('移除 collapse 键', async () => {
    const t = parseTree({ collapse: { field: 'user' } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mount(t.tree);
    await tick();
    (host.querySelector('[title="移除 collapse 键"]') as HTMLElement).click();
    await tick();
    expect(cur.value.collapse).toBeNull();
    expect(serializeTree(cur.value)).toEqual({});
  });
});

describe('987 knn 向量检索编辑', () => {
  it('加向量检索：field + 默认 k/num_candidates，向量 JSON 编辑写树', async () => {
    const { host, cur } = mount(emptyTree());
    const chip = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')].find(c => c.textContent?.includes('knn'));
    chip!.click();
    await tick();
    (host.querySelector('.rx-knn-add') as HTMLElement).click();
    await tick();
    expect(cur.value.knn?.field).toBe('status');
    expect(cur.value.knn?.params).toEqual({ k: 10, num_candidates: 100 });
    const vec = host.querySelector('.rx-knn-vec') as HTMLInputElement;
    vec.value = '[0.1, 0.2]';
    vec.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.knn?.vector).toEqual([0.1, 0.2]);
    expect(cur.value.knn?.hasVector).toBe(true);
    expect(serializeTree(cur.value).knn).toEqual({ field: 'status', query_vector: [0.1, 0.2], k: 10, num_candidates: 100 });
  });

  it('非法 JSON 标黄不写树（编辑中间态不回写循环）', async () => {
    const t = parseTree({ knn: { field: 'vec', query_vector: [1, 2] } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mount(t.tree);
    await tick();
    const vec = host.querySelector('.rx-knn-vec') as HTMLInputElement;
    vec.value = '[0.1,';
    vec.dispatchEvent(new Event('input'));
    await tick();
    expect(vec.className, '非法 JSON 标黄').toContain('warn');
    expect(cur.value.knn?.vector, '非法编辑态不写树').toEqual([1, 2]);
    vec.value = '[3]';
    vec.dispatchEvent(new Event('input'));
    await tick();
    expect(vec.className).not.toContain('warn');
    expect(cur.value.knn?.vector).toEqual([3]);
  });

  it('query_vector 缺席形态（builder）不显示假向量；hasVector=false 不写回', async () => {
    const t = parseTree({ knn: { field: 'vec', query_vector_builder: { embedding: { model_id: 'm' } } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mount(t.tree);
    await tick();
    const vec = host.querySelector('.rx-knn-vec') as HTMLInputElement;
    expect(vec.value, '缺席形态占位空数组不冒充真向量').toBe('[]');
    expect(serializeTree(cur.value)).toEqual({ knn: { field: 'vec', query_vector_builder: { embedding: { model_id: 'm' } } } });
    vec.value = '[0.5]';
    vec.dispatchEvent(new Event('input'));
    await tick();
    expect(serializeTree(cur.value).knn).toEqual({ field: 'vec', query_vector: [0.5], query_vector_builder: { embedding: { model_id: 'm' } } });
  });
});
