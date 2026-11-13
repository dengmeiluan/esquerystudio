/* 1069 续：未知字段 → 条件行内一键建运行时字段（发现→定义→使用闭环）。
   类型推断保守（值形态优先、无值才看字段名），创建的是占位字段（只有 type，不伪造 script），
   宿主提示用户去「检索参数 → 运行时字段」补 script。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, ref, nextTick, type App } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryTreePane from '../builder/QueryTreePane.vue';
import { guessRuntimeType, runtimeScriptMissing } from '../../utils/runtimeFields';
import { parseTree, serializeTree, type QueryTree } from '../../utils/queryAst';

describe('1072 guessRuntimeType（保守推断）', () => {
  it('值形态优先：数字/小数/ISO 日期/布尔', () => {
    expect(guessRuntimeType('anything', 'term', 10)).toBe('long');
    expect(guessRuntimeType('anything', 'term', 10.5)).toBe('double');
    expect(guessRuntimeType('anything', 'term', '2026-01-01')).toBe('date');
    expect(guessRuntimeType('anything', 'term', '2026-01-01T10:00:00Z')).toBe('date');
    expect(guessRuntimeType('anything', 'term', true)).toBe('boolean');
    expect(guessRuntimeType('anything', 'range', { gte: 3 })).toBe('long');
    expect(guessRuntimeType('anything', 'range', { gte: '3.5' })).toBe('double');
    expect(guessRuntimeType('anything', 'terms', [1, 2])).toBe('long');
    expect(guessRuntimeType('bond_code', 'term', '001')).toBe('keyword');
  });

  it('无值（exists）/ range 表达式才看字段名', () => {
    expect(guessRuntimeType('publish_time', 'exists', undefined)).toBe('date');
    expect(guessRuntimeType('publish_time', 'range', { gte: 'now-7d' })).toBe('date');
    expect(guessRuntimeType('title_len', 'range', { gte: 'now-7d' })).toBe('long');
    expect(guessRuntimeType('hot_score', 'exists', undefined)).toBe('long');
    expect(guessRuntimeType('is_hot', 'exists', undefined)).toBe('boolean');
  });

  it('term/wildcard 的普通字符串不按字段名猜（避免把 1* 建成 long）', () => {
    expect(guessRuntimeType('hot_score', 'wildcard', '1*')).toBe('keyword');
    expect(guessRuntimeType('publish_time', 'match', '近期')).toBe('keyword');
    expect(guessRuntimeType('pub_week', 'term', 'MONDAY')).toBe('keyword');
  });
});

const apps: App[] = [];
let host: HTMLElement;

function mount(src: unknown, fields = ['a']) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = parseTree(src);
  if (!r.ok) throw new Error('bad src');
  const tree = ref<QueryTree>(r.tree);
  const defined: Array<{ name: string; type: string }> = [];
  const edits: string[] = [];
  const app = createApp({
    render: () => h(QueryTreePane as any, {
      tree: tree.value,
      fields,
      types: Object.fromEntries(fields.map(f => [f, 'keyword'])),
      'onUpdate:tree': (t: QueryTree) => { tree.value = t; },
      onRuntimeDefined: (p: { name: string; type: string }) => defined.push(p),
      onRuntimeEdit: (n: string) => edits.push(n),
    }),
  });
  apps.push(app);
  app.mount(host);
  return { tree, defined, edits };
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('1072 运行时字段缺 script 的行内诚实提示', () => {
  it('只有 type 的占位运行时字段：提示不产出值，点击上抛补 script 定位', async () => {
    const { edits } = mount({ runtime_mappings: { title_len: { type: 'long' } }, query: { range: { title_len: { gte: 10 } } } }, ['title_len']);
    const bar = host.querySelector('.cn-defrt-bar') as HTMLElement;
    expect(bar, '缺 script 应出现提示').not.toBeNull();
    expect(bar.textContent).toContain('尚无 script');
    (bar.querySelector('.cn-defrt') as HTMLButtonElement).click();
    await nextTick();
    expect(edits).toEqual(['title_len']);
  });

  it('有 script（source/id）不再提示', () => {
    mount({ runtime_mappings: { title_len: { type: 'long', script: { source: 'emit(1)' } } }, query: { range: { title_len: { gte: 10 } } } }, ['title_len']);
    expect(host.querySelector('.cn-defrt-bar')).toBeNull();
    while (apps.length) apps.pop()!.unmount();
    document.body.innerHTML = '';
    mount({ runtime_mappings: { title_len: { type: 'long', script: { id: 'stored' } } }, query: { range: { title_len: { gte: 10 } } } }, ['title_len']);
    expect(host.querySelector('.cn-defrt-bar')).toBeNull();
  });

  it('runtimeScriptMissing：空/空串/空对象算缺，非空对象/字符串不谎报', () => {
    expect(runtimeScriptMissing({ type: 'long' })).toBe(true);
    expect(runtimeScriptMissing({ type: 'long', script: '' })).toBe(true);
    expect(runtimeScriptMissing({ type: 'long', script: {} })).toBe(true);
    expect(runtimeScriptMissing({ type: 'long', script: { source: 'emit(1)' } })).toBe(false);
    expect(runtimeScriptMissing({ type: 'long', script: { id: 'x' } })).toBe(false);
    expect(runtimeScriptMissing({ type: 'long', script: 'stored-id' })).toBe(false);
  });
});

describe('1072 条件行一键建运行时字段', () => {
  it('未知数值字段：按钮出现（tooltip 标 long），点击写入 type-only 运行时字段并上抛事件', async () => {
    const { tree, defined } = mount({ query: { range: { entity_len: { gte: 10 } } } });
    const btn = host.querySelector('.cn-defrt') as HTMLButtonElement;
    expect(btn, '未知字段应出现建运行时字段入口').not.toBeNull();
    expect(btn.textContent).toContain('运行时');
    expect(btn.title).toContain('long');
    btn.click();
    await nextTick();
    await new Promise(r => setTimeout(r));
    expect(serializeTree(tree.value).runtime_mappings).toEqual({ entity_len: { type: 'long' } });
    expect(defined).toEqual([{ name: 'entity_len', type: 'long' }]);
  });

  it('已是 .keyword 子域形态 / 已知字段：不提供（不是可定义的运行时字段名）', () => {
    mount({ query: { term: { 'a.keyword': 'x' } } }, ['a']);
    expect(host.querySelector('.cn-defrt')).toBeNull();
    while (apps.length) apps.pop()!.unmount();
    document.body.innerHTML = '';
    mount({ query: { term: { a: 'x' } } }, ['a']);
    expect(host.querySelector('.cn-defrt')).toBeNull();
  });

  it('mapping 未加载（fields 空）不提供：自由手输仍是合法路径', () => {
    mount({ query: { term: { typed: 'x' } } }, []);
    expect(host.querySelector('.cn-defrt')).toBeNull();
  });

  it('源码接线：定义走 TREE_BUS（可撤销 commitTree），宿主提示补 script', () => {
    const pane = readFileSync(join(__dirname, '../builder/QueryTreePane.vue'), 'utf-8');
    expect(pane).toContain('defineRuntime(name, type)');
    expect(pane).toContain('commitTree({ ...props.tree, runtimeMappings: { items: [...items, { name: n, body: { type } }] } });');
    expect(pane).toContain("emit('runtime-defined', { name: n, type });");
    const dq = readFileSync(join(__dirname, '../../views/DslQueryView.vue'), 'utf-8');
    expect(dq).toContain('@runtime-defined="onRuntimeDefined"');
    expect(dq).toContain('@runtime-edit="onRuntimeEdit"');
    expect(dq).toContain('paramsOpen.value = true;');
    expect(dq).toContain('function onRuntimeEdit(name: string)');
    expect(dq).toContain('补 script 后即可查询');
    const extras = readFileSync(join(__dirname, '../builder/RootExtrasPane.vue'), 'utf-8');
    expect(extras).toContain('provide(RUNTIME_FIELD_CTX, { noScript: runtimeNoScriptNames, edit: editRuntimeByName });');
    expect(extras).toContain(':model-value="tree.collapse.field" :fields="colFields"');
    expect(extras).toContain('运行时字段不能用于 collapse');
    expect(extras).toContain(':model-value="f.name" :fields="hlFields"');
    expect(extras).toContain('运行时字段不支持高亮');
    const fs = readFileSync(join(__dirname, '../builder/FieldSelect.vue'), 'utf-8');
    expect(fs).toContain('const rtCtx = inject(RUNTIME_FIELD_CTX, null);');
    expect(fs).toContain('rtCtx?.edit(props.modelValue);');
    const clause = readFileSync(join(__dirname, '../builder/ClauseNode.vue'), 'utf-8');
    expect(clause).toContain('if (runtimeField.value) return;');
    expect(clause).toContain('if (aggField && termCtx && !runtimeField.value)');
  });
});
