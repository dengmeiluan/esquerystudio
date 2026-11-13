/* 1054：nested 子树字段域——候选收窄到 path.*，映射未展开时明示回退全量。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick, ref, type App } from 'vue';
import QueryTreePane from '../components/builder/QueryTreePane.vue';
import { parseTree, type QueryTree } from '../utils/queryAst';
import { nestedFieldScope, setFieldSearchIndex } from '../utils/fieldSearch';

const FIELDS = ['shareholders', 'shareholders.name', 'shareholders.pct', 'title'];
const TYPES: Record<string, string> = {
  shareholders: 'nested', 'shareholders.name': 'keyword', 'shareholders.pct': 'double', title: 'text',
};
const NESTED_DSL = { query: { nested: { path: 'shareholders', query: { term: { 'shareholders.name': 'x' } } } } };

async function settle(n = 6) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const apps: App[] = [];
function mount(dsl: Record<string, unknown>, fields: string[] = FIELDS) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const r = parseTree(dsl); if (!r.ok) throw new Error(r.reason);
  const tree = ref<QueryTree>(r.tree);
  const app = createApp({
    render: () => h(QueryTreePane, {
      tree: tree.value, fields, types: TYPES,
      'onUpdate:tree': (t: QueryTree) => { tree.value = t; },
    }),
  });
  apps.push(app); app.mount(host);
  return { host, tree };
}
const popNames = () => Array.from(document.body.querySelectorAll('.fs-item .fs-nm')).map(el => el.textContent);

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  setFieldSearchIndex('');
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('1054 nested 字段域纯函数', () => {
  it('只留 path.* 子字段，排除 path 自身与顶层字段', () => {
    const s = nestedFieldScope(FIELDS, 'shareholders');
    expect(s.fields).toEqual(['shareholders.name', 'shareholders.pct']);
    expect(s.fallback).toBe(false);
  });
  it('路径末尾点归一；空路径/映射无子字段回退全量并标记 fallback', () => {
    expect(nestedFieldScope(FIELDS, 'shareholders.').fields).toEqual(['shareholders.name', 'shareholders.pct']);
    expect(nestedFieldScope(FIELDS, '').fields).toBe(FIELDS);
    const fb = nestedFieldScope(['shareholders', 'title'], 'shareholders');
    expect(fb.fields).toEqual(['shareholders', 'title']);
    expect(fb.fallback).toBe(true);
  });
});

describe('1054 nested 子树字段候选', () => {
  it('子条件 FieldSelect 只列 path.* 子字段', async () => {
    const { host } = mount(NESTED_DSL);
    await settle();
    expect(host.querySelector('.wnr-scope')?.textContent).toContain('内嵌域 · 2 字段');
    const inputs = host.querySelectorAll<HTMLInputElement>('.fs-inp');
    expect(inputs.length).toBe(2); // 路径选择 + 子条件字段
    inputs[1].dispatchEvent(new Event('focus'));
    await settle();
    inputs[1].value = ''; inputs[1].dispatchEvent(new Event('input'));
    await settle();
    const names = popNames();
    expect(names).toContain('shareholders.name');
    expect(names).toContain('shareholders.pct');
    expect(names, '顶层字段不得出现在 nested 子条件候选').not.toContain('title');
  });

  it('映射未展开子字段 → 回退全量并显式 warn', async () => {
    const { host } = mount(NESTED_DSL, ['shareholders', 'title']);
    await settle();
    const chip = host.querySelector('.wnr-scope');
    expect(chip?.classList.contains('warn')).toBe(true);
    expect(chip?.textContent).toContain('未发现内嵌子字段');
    const inputs = host.querySelectorAll<HTMLInputElement>('.fs-inp');
    inputs[1].dispatchEvent(new Event('focus'));
    await settle();
    inputs[1].value = ''; inputs[1].dispatchEvent(new Event('input'));
    await settle();
    expect(popNames()).toContain('title');
  });
});
