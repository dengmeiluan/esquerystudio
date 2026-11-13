/* 996 批组件契约：script_fields / runtime_mappings 双键一等编辑（chips/项行/名称与体编辑/
   删除/移除键/自动展开）。chips 序位锁面不变：排序[0]/_source[1]/高亮[2]/聚合[3] 之后追加。 */
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

const tick = () => new Promise(r => setTimeout(r));
const apps: App[] = [];

function mountPane(tree: QueryTree) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(tree);
  const app = createApp({
    render: () => h(RootExtrasPane, {
      tree: cur.value, fields: ['status'], types: { status: 'keyword' },
      index: '', 'onUpdate:tree': (t: QueryTree) => { cur.value = t; },
    }),
  });
  apps.push(app);
  app.use(createPinia());
  app.mount(host);
  return { host, cur };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue({ raw: { properties: { status: { type: 'keyword' } } } });
});
afterEach(() => { apps.splice(0).forEach(a => a.unmount()); });

describe('996 script_fields 项级编辑', () => {
  it('加脚本字段：默认可用 script 体；名称自增；序列化完整', async () => {
    const { host, cur } = mountPane(emptyTree());
    const chip = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')].find(c => c.textContent?.includes('script_fields'));
    expect(chip, 'script_fields chip 必须在场').toBeTruthy();
    chip!.click();
    await tick();
    (host.querySelector('.rx-sf-add') as HTMLElement).click();
    await tick();
    (host.querySelector('.rx-sf-add2') as HTMLElement).click();
    await tick();
    const items = cur.value.scriptFields!.items;
    expect(items.map(x => x.name)).toEqual(['script_field_1', 'script_field_2']);
    expect(items[0].body).toEqual({ script: { source: '' } });
    expect(serializeTree(cur.value).script_fields).toEqual({
      script_field_1: { script: { source: '' } },
      script_field_2: { script: { source: '' } },
    });
  });

  it('名称编辑 + 脚本体递归表改 source 写回', async () => {
    const t = parseTree({ script_fields: { bonus: { script: { source: '1' } } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mountPane(t.tree);
    await tick();
    expect(host.querySelector('.rx-named-row'), '解析形态自动展开').not.toBeNull();
    const name = host.querySelector<HTMLInputElement>('.rx-named-row .rx-sug-name');
    name!.value = 'renamed';
    name!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.scriptFields!.items[0].name).toBe('renamed');
    (host.querySelector('button[aria-label="脚本字段参数"]') as HTMLElement).click();
    await tick();
    const src = host.querySelector('.rx-sub .gp-v') as HTMLInputElement;
    expect(src).toBeTruthy();
    src.value = "doc['n'].value";
    src.dispatchEvent(new Event('input'));
    await tick();
    expect(serializeTree(cur.value).script_fields).toEqual({ renamed: { script: { source: "doc['n'].value" } } });
  });

  it('删除项与移除键', async () => {
    const t = parseTree({ script_fields: { a: { script: { source: '1' } } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mountPane(t.tree);
    await tick();
    (host.querySelector('button[aria-label="删除脚本字段"]') as HTMLElement).click();
    await tick();
    expect(cur.value.scriptFields!.items.length).toBe(0);
    expect(serializeTree(cur.value).script_fields).toEqual({});
    (host.querySelector('[title="移除 script_fields 键"]') as HTMLElement).click();
    await tick();
    expect(cur.value.scriptFields).toBeNull();
    expect(serializeTree(cur.value)).toEqual({});
  });
});

describe('996 runtime_mappings 项级编辑', () => {
  it('加运行时字段：默认 type=keyword 体；type 经递归表 enum 式改值写回', async () => {
    const { host, cur } = mountPane(emptyTree());
    const chip = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')].find(c => c.textContent?.includes('runtime_mappings'));
    chip!.click();
    await tick();
    (host.querySelector('.rx-rm-add') as HTMLElement).click();
    await tick();
    expect(cur.value.runtimeMappings!.items[0].body).toEqual({ type: 'keyword' });
    (host.querySelector('button[aria-label="运行时字段参数"]') as HTMLElement).click();
    await tick();
    const tv = host.querySelector('.rx-sub .gp-v') as HTMLInputElement;
    tv.value = 'long';
    tv.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.runtimeMappings!.items[0].body).toEqual({ type: 'long' });
    expect(serializeTree(cur.value).runtime_mappings).toEqual({ runtime_field_1: { type: 'long' } });
  });

  it('解析形态自动展开 + 移除键', async () => {
    const t = parseTree({ runtime_mappings: { f: { type: 'long', script: { source: '1' } } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mountPane(t.tree);
    await tick();
    expect(host.querySelector('[title="移除 runtime_mappings 键"]'), '有内容默认展开').not.toBeNull();
    (host.querySelector('[title="移除 runtime_mappings 键"]') as HTMLElement).click();
    await tick();
    expect(cur.value.runtimeMappings).toBeNull();
    expect(serializeTree(cur.value)).toEqual({});
  });
});
