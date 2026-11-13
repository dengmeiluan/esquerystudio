/* 1053：多选手势——Shift 连续范围（按可见行序）、Esc 退出、Ctrl+A 全选且不劫持文字输入。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, shallowRef } from 'vue';
import QueryTreePane from '../components/builder/QueryTreePane.vue';
import { parseTree, type QueryTree } from '../utils/queryAst';

const tick = () => new Promise(r => setTimeout(r, 0));
const treeOf = (dsl: Record<string, unknown>): QueryTree => {
  const r = parseTree(dsl);
  if (!r.ok) throw new Error(r.reason);
  return r.tree;
};
const dsl5 = { query: { bool: { must: [
  { term: { a: 1 } }, { term: { b: 2 } }, { term: { c: 3 } }, { term: { d: 4 } }, { term: { e: 5 } },
] } } };

describe('1053 多选手势', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); sessionStorage.clear(); });

  function mount(dsl: Record<string, unknown>) {
    const host = document.createElement('div'); document.body.appendChild(host);
    const cur = shallowRef<QueryTree>(treeOf(dsl));
    const app = createApp({
      render: () => h(QueryTreePane, {
        tree: cur.value, fields: ['a', 'b', 'c', 'd', 'e'], types: {},
        'onUpdate:tree': (x: QueryTree) => { cur.value = x; },
      }),
    });
    app.mount(host);
    return { host, cur };
  }
  const btn = (host: ParentNode, text: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text);
  const chip = (host: ParentNode) => (host.querySelector('.qtp-sel-cnt')?.textContent || '').replace(/\s+/g, ' ');
  async function shiftClick(box: HTMLInputElement) {
    box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: true }));
    box.dispatchEvent(new Event('change'));
    await tick();
  }

  it('Shift+点击 → 选中上次勾选到当前行的可见区间；再 Shift 取消区间', async () => {
    const { host } = mount(dsl5);
    await tick();
    btn(host, '多选')!.click(); await tick();
    const boxes = [...host.querySelectorAll<HTMLInputElement>('.cn .nsb input')];
    boxes[0].click(); await tick();
    expect(chip(host)).toContain('已选 1');

    await shiftClick(boxes[3]);
    expect(chip(host)).toContain('已选 4');

    await shiftClick(boxes[1]);
    expect(chip(host), '从第 2 到第 4 行整段取消，仅剩第 1 行').toContain('已选 1');
  });

  it('Esc 退出多选；Ctrl+A 全选（含根组）', async () => {
    const { host } = mount(dsl5);
    await tick();
    btn(host, '多选')!.click(); await tick();
    const first = host.querySelector<HTMLInputElement>('.cn .nsb input')!;
    first.click(); await tick();

    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })); await tick();
    expect(chip(host), '根组 + 5 叶').toContain('已选 6');

    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick();
    expect(host.querySelectorAll('.nsb input').length).toBe(0);
    expect(btn(host, '多选')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('过滤输入框内 Ctrl+A 不被劫持', async () => {
    const { host } = mount(dsl5);
    await tick();
    btn(host, '多选')!.click(); await tick();
    host.querySelector<HTMLInputElement>('.cn .nsb input')!.click(); await tick();
    expect(chip(host)).toContain('已选 1');

    const filter = host.querySelector<HTMLInputElement>('.qtp-find input')!;
    filter.focus();
    const e = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    filter.dispatchEvent(e); await tick();
    expect(chip(host), '文字输入框保留原生全选').toContain('已选 1');
    expect(e.defaultPrevented).toBe(false);
  });
});
