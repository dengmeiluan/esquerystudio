/* 1016 批（初记 1015，与 d0367b1 撞号勘误）组件契约：pinned ids chips 编辑位（WrapNodeRow 挂接）——
   ① chips 渲染 + organic 子树共存；回车/逗号/blur 提交、粘贴按项拆分、IME Enter 守卫、
      Backspace 空删末项、chip 可删（1005 terms/ids 同款交互）
   ② 参数表视图剥 ids（chips 权威）、表内加出 ids 路由回 params 不丢
   ③ docs 形态 / ids 非数组不走 chips 位（params 保真）；整树 serializeTree 往返 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import WrapNodeRow from '../builder/WrapNodeRow.vue';
import { parseQueryNode, serQueryNode, type WrapNode } from '../../utils/queryAst';

function mkPinned(ids: unknown = ['1', '2']): WrapNode {
  const n = parseQueryNode({ pinned: { ids, organic: { term: { a: 1 } } } });
  if (n.type !== 'wrap') throw new Error('not wrap');
  return n;
}

const apps: App[] = [];
function mount(node: WrapNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(WrapNodeRow, {
      node: cur.value, fields: ['a'], types: { a: 'keyword' },
      'onUpdate:node': (n: WrapNode) => { cur.value = n; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, cur };
}
const tick = () => new Promise(r => setTimeout(r));
/* v-model 输入同步：设 DOM value 后须派发 input 事件，draft 才进组件态 */
function setIdDraft(inp: HTMLInputElement, raw: string) {
  inp.value = raw;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('1015 pinned ids chips 编辑位', () => {
  it('chips 与 organic 子树共存渲染', () => {
    const { host } = mount(mkPinned());
    const chips = [...host.querySelectorAll('.wnr-chip-v')].map(e => e.textContent);
    expect(chips).toEqual(['1', '2']);
    expect(host.querySelector('.wnr-body .cn'), 'organic 子树渲染').not.toBeNull();
  });

  it('回车提交；粘贴含逗号/中文逗号按项拆分', async () => {
    const { host, cur } = mount(mkPinned());
    const inp = host.querySelector<HTMLInputElement>('.wnr-ids-in')!;
    setIdDraft(inp, '3,4，5');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    expect(cur.value.params.ids).toEqual(['1', '2', '3', '4', '5']);
  });

  it('逗号键即时提交；blur 提交残余 draft', async () => {
    const { host, cur } = mount(mkPinned());
    const inp = host.querySelector<HTMLInputElement>('.wnr-ids-in')!;
    setIdDraft(inp, '9');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));
    await tick();
    expect(cur.value.params.ids).toEqual(['1', '2', '9']);
    setIdDraft(inp, '10');
    inp.dispatchEvent(new Event('blur'));
    await tick();
    expect(cur.value.params.ids).toEqual(['1', '2', '9', '10']);
  });

  it('IME 组合态 Enter 不提交（原文保留待续输）', async () => {
    const { host, cur } = mount(mkPinned());
    const inp = host.querySelector<HTMLInputElement>('.wnr-ids-in')!;
    inp.value = '中文';
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const ime = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(ime, 'isComposing', { value: true });
    inp.dispatchEvent(ime);
    await tick();
    expect(cur.value.params.ids).toEqual(['1', '2']);
  });

  it('空输入 Backspace 删末项；chip 删除钮删指定项', async () => {
    const { host, cur } = mount(mkPinned());
    const inp = host.querySelector<HTMLInputElement>('.wnr-ids-in')!;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    await tick();
    expect(cur.value.params.ids).toEqual(['1']);
    (host.querySelector('button[aria-label="删除 id 1"]') as HTMLElement).click();
    await tick();
    expect(cur.value.params.ids).toEqual([]);
  });

  it('chips 编辑后节点序列化往返一致（AST 零改动直通）', async () => {
    const { host, cur } = mount(mkPinned());
    const inp = host.querySelector<HTMLInputElement>('.wnr-ids-in')!;
    setIdDraft(inp, '99');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    expect(serQueryNode(cur.value)).toEqual({
      pinned: { ids: ['1', '2', '99'], organic: { term: { a: 1 } } },
    });
  });
});

describe('1015 pinned 参数分账与退化', () => {
  it('参数表视图剥 ids；表内改出 ids 路由回 params（非数组保真共存）', async () => {
    const { host, cur } = mount(mkPinned());
    (host.querySelector('button[aria-label="参数（score_mode 等）"]') as HTMLElement).click();
    await tick();
    const rows = [...host.querySelectorAll('.wnr-params .gp-row')];
    expect(rows.every(r => !r.textContent?.includes('ids')), '参数表不见 ids').toBe(true);
    /* 表内加键 ids（串形态）：路由回 params 保真，chips 位退场 */
    const addKey = host.querySelector<HTMLInputElement>('.wnr-params .gp-add input')!;
    addKey.value = 'ids';
    addKey.dispatchEvent(new Event('input'));
    (host.querySelector('.wnr-params .gp-add button') as HTMLElement).click();
    await tick();
    expect(cur.value.params.ids).toEqual('');
    expect(host.querySelector('.wnr-ids'), '非数组 ids chips 位退场').toBeNull();
  });

  it('docs 形态（无 ids 键）不走 chips 位，params 保真', () => {
    const node = mkPinnedDocs();
    const { host } = mount(node);
    expect(host.querySelector('.wnr-ids'), 'docs 形态无 chips').toBeNull();
    expect(JSON.stringify(node.params)).toContain('docs');
  });
});

function mkPinnedDocs(): WrapNode {
  const n = parseQueryNode({ pinned: { docs: [{ _index: 'i', _id: '1' }], organic: { match_all: {} } } });
  if (n.type !== 'wrap') throw new Error('not wrap');
  return n;
}
