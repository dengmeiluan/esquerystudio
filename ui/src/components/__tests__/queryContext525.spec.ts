/**
 * 五百二十五批：字段选择的「当前查询上下文」智能——
 *  ① fieldSearch usedFields 模块态（写读契约：去重/空值过滤；QueryTreePane watch 树写入，FieldSelect 只读）；
 *  ② FieldSelect 候选 recent 段之后前置「树内已用」命中段（rank 不变、同 rank 内 used 优先；
 *    prio 模式只在分组组内前置，typePriority 组序完整性不破；data-t 徽标逐行仍准确）；
 *  ③ FieldPicker 候选侧补 recent 前置（与 FieldSelect 同口径——消除「写 recent 却不吃 recent」不对称）。
 * 错配黄点一键改推荐算子的行为例见 clauseNode.spec（五百二十五批段）。
 * 范式同 fieldSelectPopup.spec / fieldPicker.spec：createApp 手工 mount；弹层 Teleport 到 body 断言查 document.body。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, ref, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import FieldSelect from '../builder/FieldSelect.vue';
import QueryTreePane from '../builder/QueryTreePane.vue';
import FieldPicker from '../FieldPicker.vue';
import {
  setFieldSearchIndex, setFieldSearchUsedFields, getFieldSearchUsedFields,
} from '../../utils/fieldSearch';
import { parseTree, type QueryTree } from '../../utils/queryAst';
import { __clearFieldCache } from '../../composables/useIndexFields';

const apps: App[] = [];

async function settle(n = 6) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* ═══ FieldSelect / QueryTreePane 手工挂载（fieldSelectPopup.spec 同款） ═══ */

function mountSelect(opts: {
  fields?: string[]; types?: Record<string, string>; model?: string; typePriority?: string[];
} = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const val = ref(opts.model ?? '');
  const app = createApp({
    render: () => h(FieldSelect, {
      modelValue: val.value,
      fields: opts.fields ?? [],
      types: opts.types ?? {},
      ...(opts.typePriority !== undefined ? { typePriority: opts.typePriority } : {}),
      'onUpdate:modelValue': (v: string) => { val.value = v; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, val };
}

function mountTree(src: unknown, opts: { fields?: string[]; types?: Record<string, string>; index?: string } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = parseTree(src);
  if (!r.ok) throw new Error('bad src');
  const tree = ref(r.tree);
  const app = createApp({
    render: () => h(QueryTreePane, {
      tree: tree.value,
      fields: opts.fields ?? ['a', 'b', 'c'],
      types: opts.types ?? { a: 'keyword', b: 'keyword', c: 'keyword' },
      index: opts.index,
      'onUpdate:tree': (t: QueryTree) => { tree.value = t; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, tree };
}

/* FieldPicker：只 mock 网络出口（fieldPicker.spec 同款最小骨架），组件/store/composable 全用真的 */
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
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

const FXP_MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  message: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  user: { properties: { name: { type: 'text' }, age: { type: 'integer' } } },
} } };
const ALL_NAMES = ['message', 'message.keyword', 'status', 'user', 'user.age', 'user.name'];

async function mountPicker(init: { index?: string } = {}) {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(FieldPicker, { modelValue: '', index: init.index ?? 'logs-2026.08' }) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle(12);
  return { host };
}

/* 断言辅助：弹层 teleport 到 body */
const names = () => Array.from(document.body.querySelectorAll('.fs-item .fs-nm')).map(el => el.textContent);
const fxpNames = () => Array.from(document.body.querySelectorAll('.fxp-item .fxp-name')).map(el => el.textContent);
const inp = (host: ParentNode) => host.querySelector<HTMLInputElement>('.fs-inp')!;
async function focus(host: ParentNode) { inp(host).dispatchEvent(new Event('focus')); await settle(); }
async function type(host: ParentNode, v: string) { inp(host).value = v; inp(host).dispatchEvent(new Event('input')); await settle(); }
async function key(host: ParentNode, k: string) { inp(host).dispatchEvent(new KeyboardEvent('keydown', { key: k })); await settle(); }

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  setFieldSearchIndex('');            // 模块态逐用例复位（fieldSelectPopup.spec 同款隔离）
  setFieldSearchUsedFields([]);
  __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue(FXP_MAPPING);
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('usedFields 模块态写读（fieldSearch）', () => {
  it('setFieldSearchUsedFields：去重、滤空值，getFieldSearchUsedFields 读回', () => {
    setFieldSearchUsedFields(['b', 'a', 'b', '', 'a', '']);
    expect(getFieldSearchUsedFields(), '去重保首现序、空字段名滤掉').toEqual(['b', 'a']);
  });
});

describe('QueryTreePane watch 树→写 usedFields', () => {
  it('挂载即收集全部叶子条件字段名（嵌套 bool 下钻、去重）；树引用替换后更新', async () => {
    const { tree } = mountTree({
      query: { bool: {
        must: [{ term: { a: 1 } }, { bool: { should: [{ match: { b: 'x' } }, { term: { b: 2 } }] } }],
        filter: [{ term: { c: 3 } }],
      } },
    });
    expect(getFieldSearchUsedFields(), '嵌套叶字段去重收集、按首现序').toEqual(['a', 'b', 'c']);
    /* 树编辑全走不可变更新：引用替换触发 watch 重扫 */
    const r2 = parseTree({ query: { term: { a: 9 } } });
    if (!r2.ok) throw new Error('bad src');
    tree.value = r2.tree;
    await new Promise(x => setTimeout(x));
    expect(getFieldSearchUsedFields(), '树变化后重扫（不残留旧字段）').toEqual(['a']);
  });

  it('wrap 节点下钻收集叶字段；wrap 路由字段本身不是条件字段不入集；match_all 空集', async () => {
    const { tree } = mountTree({ query: { term: { a: 1 } } });
    tree.value = {
      ...tree.value,
      root: { id: 'w', type: 'wrap', op: 'nested', field: 'route_f', params: {},
        child: { id: 'l9', type: 'leaf', op: 'term', field: 'inner_f', value: 1, params: {}, raw: null } },
    };
    await new Promise(x => setTimeout(x));
    expect(getFieldSearchUsedFields(), '只收叶子条件字段（wrap 路由字段不算）').toEqual(['inner_f']);
    const r2 = parseTree({ query: { match_all: {} } });
    if (!r2.ok) throw new Error('bad src');
    tree.value = r2.tree;
    await new Promise(x => setTimeout(x));
    expect(getFieldSearchUsedFields(), 'match_all 无条件字段=空集').toEqual([]);
  });
});

describe('FieldSelect used 前置段', () => {
  it('空 query：树内已用字段整体前置（同 rank 全等价），键盘 Enter 命中高亮首项（i 重编不错位）', async () => {
    setFieldSearchUsedFields(['zeta']);
    const { host, val } = mountSelect({ fields: ['alpha', 'beta', 'zeta'] });
    await focus(host);
    expect(names(), 'used zeta 前置，其余保持字母序').toEqual(['zeta', 'alpha', 'beta']);
    const act = () => Array.from(document.body.querySelectorAll('.fs-item')).findIndex(el => el.classList.contains('act'));
    expect(act(), '重排后 i 与数组下标一致：高亮必须落在首项（used 段）').toBe(0);
    await key(host, 'Enter');
    expect(val.value, 'Enter 必须选中高亮项').toBe('zeta');
  });

  it('非空 query：rank 不变——used 的包含命中不越过非 used 的精确/前缀命中，used 只在同档内前置', async () => {
    setFieldSearchUsedFields(['zz_user']);
    const { host } = mountSelect({ fields: ['user', 'user.name', 'aa_user', 'zz_user'] });
    await focus(host);
    await type(host, 'user');
    expect(names(), '档序 user(精确)>user.name(前缀)>包含段；包含段内 used zz_user 先').toEqual([
      'user', 'user.name', 'zz_user', 'aa_user',
    ]);
  });

  it('recent 段保持最前：次序 recent → used → 其余（段间去重不重复出项）', async () => {
    setFieldSearchIndex('idx-525');
    setFieldSearchUsedFields(['alpha', 'zeta']);
    localStorage.setItem('esquerystudio_qb_field_recent::idx-525', JSON.stringify(['zeta']));
    const { host } = mountSelect({ fields: ['beta', 'alpha', 'zeta'] });
    await focus(host);
    expect(names(), 'zeta(recent+used 双命中)最前且只出一次，alpha(used)次之').toEqual(['zeta', 'alpha', 'beta']);
  });

  it('多 FieldSelect 实例同页读同一份全局集（used 语义本就全局，不串也不私有化）', async () => {
    setFieldSearchUsedFields(['mm']);
    const h1 = mountSelect({ fields: ['aa', 'mm'] });
    const h2 = mountSelect({ fields: ['bb', 'mm'] });
    await focus(h1.host);
    expect(names(), '实例一同前置').toEqual(['mm', 'aa']);
    await key(h1.host, 'Escape');
    await settle();
    await focus(h2.host);
    expect(names(), '实例二同前置（全局集一致；body 双弹层混查用先关再开规避）').toEqual(['mm', 'bb']);
  });

  it('prio 模式：used 只在分组组内前置——typePriority 组序完整、data-t 徽标逐行仍准确', async () => {
    setFieldSearchUsedFields(['a_obj']);
    const { host } = mountSelect({
      fields: ['a_title', 'z_status', 'a_obj', 'z_other'],
      types: { a_title: 'text', z_status: 'keyword', a_obj: 'object', z_other: 'long' },
      typePriority: ['keyword'],
    });
    await focus(host);
    const gh = Array.from(document.body.querySelectorAll('.fs-gh')).map(el => el.textContent);
    /* 五百五十九批：组头词面随 fieldSearch.GH_LABEL 兜底 FIELD_TYPE_ZH 升级（keyword→精确值），排序断言语义保形 */
    expect(gh, '组序仍是 keyword→其他：used 的 object 字段不得把「其他」组顶到最前').toEqual(['精确值 字段', '其他 字段']);
    expect(names(), 'keyword 组在前；殿后段内 used a_obj 组内前置').toEqual(['z_status', 'a_obj', 'a_title', 'z_other']);
    const tags = Array.from(document.body.querySelectorAll('.fs-item .fs-ty')).map(el => (el as HTMLElement).dataset.t);
    expect(tags, 'data-t 徽标与行内容一一对应（前置段不串档）').toEqual(['keyword', 'object', 'text', 'long']);
  });
});

describe('FieldPicker recent 前置（候选侧补读，与 FieldSelect 同口径）', () => {
  it('per-index recent 命中段式全前置、段内保持原序；页脚计数不变', async () => {
    localStorage.setItem('esquerystudio_qb_field_recent::logs-2026.08', JSON.stringify(['status']));
    const { host } = await mountPicker();
    const fxpInp = host.querySelector<HTMLInputElement>('.fxp-inp')!;
    fxpInp.dispatchEvent(new Event('focus'));
    await settle(12);
    expect(fxpNames(), 'status 前置，其余保持既有字母序').toEqual(['status', ...ALL_NAMES.filter(n => n !== 'status')]);
    expect(document.body.querySelector('.fxp-ft')!.textContent, '页脚计数不受重排影响').toContain('6/6 匹配');
  });

  it('recent 字段不在候选集（幽灵记录）时零变化：既有排序不回归', async () => {
    localStorage.setItem('esquerystudio_qb_field_recent::logs-2026.08', JSON.stringify(['ghost_field']));
    const { host } = await mountPicker();
    const fxpInp = host.querySelector<HTMLInputElement>('.fxp-inp')!;
    fxpInp.dispatchEvent(new Event('focus'));
    await settle(12);
    expect(fxpNames(), '无命中段=原序原样').toEqual(ALL_NAMES);
  });

  it('recent 键拼 index prop（与 choose 回写同键）：切键不串索引', async () => {
    localStorage.setItem('esquerystudio_qb_field_recent::other-idx', JSON.stringify(['status']));
    const { host } = await mountPicker({ index: 'logs-2026.08' });
    const fxpInp = host.querySelector<HTMLInputElement>('.fxp-inp')!;
    fxpInp.dispatchEvent(new Event('focus'));
    await settle(12);
    expect(fxpNames(), '本索引无记录（他索引键不串）=原序').toEqual(ALL_NAMES);
  });
});
