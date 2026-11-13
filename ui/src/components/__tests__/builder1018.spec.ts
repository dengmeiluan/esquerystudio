/* 1018 批组件契约：more_like_this like 混合形态一等编辑位（MltLikeEditor + ClauseNode 分派）——
   ① like 对象 = JSON 文档编辑区（合法写回/非法标红不写/外部回流）
   ② like 数组 = chips（串项文本、对象项文档摘要+选中 JSON 编辑）+ 回车追加文本项 + 删项
   ③ 字符串 like 维持既有文本输入；fields 列表输入不受影响；整树序列化往返 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import ClauseNode from '../builder/ClauseNode.vue';
import { serQueryNode, type LeafNode } from '../../utils/queryAst';

const mk = (value: unknown, fields: string[] | null = ['title']): LeafNode => ({
  id: 'm1', type: 'leaf', op: 'more_like_this', field: null, fields, value, params: {}, raw: null,
});

const apps: App[] = [];
function mount(node: LeafNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(ClauseNode, {
      node: cur.value, fields: ['title', 'body'], types: { title: 'text', body: 'text' },
      'onUpdate:node': (n: LeafNode) => { cur.value = n; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, cur };
}
const tick = () => new Promise(r => setTimeout(r));

beforeEach(() => { document.body.innerHTML = ''; });

describe('1018 like 对象形态（JSON 文档编辑区）', () => {
  it('文档对象渲染 pretty JSON；合法编辑写回；非法标红不写', async () => {
    const { host, cur } = mount(mk({ _index: 'i', _id: '1' }));
    const ta = host.querySelector<HTMLTextAreaElement>('.mlt-json');
    expect(ta, 'JSON 编辑区在场').not.toBeNull();
    expect(JSON.parse(ta!.value)).toEqual({ _index: 'i', _id: '1' });
    ta!.value = '{"doc":{"title":"bike"}}';
    ta!.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(cur.value.value).toEqual({ doc: { title: 'bike' } });
    ta!.value = '{"半截":';
    ta!.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(ta!.classList.contains('bad'), '半截标红').toBe(true);
    expect(cur.value.value).toEqual({ doc: { title: 'bike' } });
  });
});

describe('1018 like 数组形态（chips + 选中项 JSON）', () => {
  const MIXED = () => (['free text', { _index: 'i', _id: '1' }, { doc: { title: 'bike' } }]);
  it('混合数组渲染 chips（串项文本 + 文档项摘要）；fields 列表输入共存', () => {
    const { host } = mount(mk(MIXED()));
    const chips = [...host.querySelectorAll('.mlt-chip-v')].map(e => e.textContent);
    expect(chips).toEqual(['free text', 'i/1', 'doc:title']);
    expect((host.querySelector('.cn-fields') as HTMLInputElement).value).toBe('title');
  });

  it('回车追加文本项；删项写回（选中位联动）', async () => {
    const { host, cur } = mount(mk(MIXED()));
    const inp = host.querySelector<HTMLInputElement>('.mlt-in')!;
    inp.value = 'new text';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    expect(cur.value.value).toHaveLength(4);
    (host.querySelector('.mlt-chip-x') as HTMLElement).click();
    await tick();
    expect(cur.value.value).toEqual([{ _index: 'i', _id: '1' }, { doc: { title: 'bike' } }, 'new text']);
  });

  it('点文档 chip 选中展开 JSON 编辑区；编辑写回对应位', async () => {
    const { host, cur } = mount(mk(MIXED()));
    const docChip = ([...host.querySelectorAll('.mlt-chip')] as HTMLElement[]).filter(c => c.classList.contains('doc'))[0];
    docChip.click();
    await tick();
    const ta = host.querySelector<HTMLTextAreaElement>('.mlt-sel');
    expect(ta, '选中项 JSON 编辑区').not.toBeNull();
    expect(JSON.parse(ta!.value)).toEqual({ _index: 'i', _id: '1' });
    ta!.value = '{"_index":"i","_id":"9"}';
    ta!.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect((cur.value.value as unknown[])[1]).toEqual({ _index: 'i', _id: '9' });
    /* 整树序列化往返 */
    expect(serQueryNode(cur.value)).toEqual({
      more_like_this: { like: ['free text', { _index: 'i', _id: '9' }, { doc: { title: 'bike' } }], fields: ['title'] },
    });
  });

  it('IME 组合态 Enter 不提交', async () => {
    const { host, cur } = mount(mk(MIXED()));
    const inp = host.querySelector<HTMLInputElement>('.mlt-in')!;
    inp.value = '中文';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    const ime = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(ime, 'isComposing', { value: true });
    inp.dispatchEvent(ime);
    await tick();
    expect(cur.value.value).toHaveLength(3);
  });
});

describe('1018 字符串 like 维持既有输入（不进编辑器）', () => {
  it('串形态走 .cn-val 文本输入，无 .mlt 编辑器', () => {
    const { host } = mount(mk('once upon a time'));
    expect(host.querySelector('.mlt'), '专用编辑器退场').toBeNull();
    expect((host.querySelector('.cn-val') as HTMLInputElement).value).toBe('once upon a time');
  });
});
