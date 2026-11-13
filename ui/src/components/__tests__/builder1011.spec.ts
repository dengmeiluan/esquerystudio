/* 1011 批组件契约：intervals 专用递归编辑位（ClauseNode 挂接 + IntervalsEditor 行为）——
   ① 可解析规则 → 专用编辑器接管（类型下拉/主值/_name/参数表/递归子规则/位置过滤槽）
   ② 编辑写回经 serIntervalRule 直通 leaf.value（整树 serializeTree 深等价）
   ③ 畸形规则体 → 退化通用键值表（.gp 在场 .ivr 缺席），chips 骨架键名 all_of/any_of（官方键） */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import ClauseNode from '../builder/ClauseNode.vue';
import { parseTree, serializeTree, type LeafNode, type QueryTree } from '../../utils/queryAst';

const mk = (value: unknown): LeafNode => ({
  id: 'iv1', type: 'leaf', op: 'intervals', field: 'title', value, params: {}, raw: null,
});

const apps: App[] = [];
function mount(node: LeafNode, types: Record<string, string> = { title: 'text' }) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(ClauseNode, {
      node: cur.value, fields: Object.keys(types), types,
      'onUpdate:node': (n: LeafNode) => { cur.value = n; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, cur };
}
const tick = () => new Promise(r => setTimeout(r));

beforeEach(() => { document.body.innerHTML = ''; });

describe('1011 intervals 专用编辑位', () => {
  it('可解析 match → 编辑器接管：类型下拉/主值输入就位，值编辑 ser 直通', async () => {
    const { host, cur } = mount(mk({ match: { query: 'foo', max_gaps: 2 } }));
    const kind = host.querySelector<HTMLSelectElement>('.ivr-kind');
    expect(kind, '专用编辑器在场').not.toBeNull();
    expect(kind!.value).toBe('match');
    const main = host.querySelector<HTMLInputElement>('.ivr-main');
    expect(main!.value).toBe('foo');
    main!.value = 'bar';
    main!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({ match: { query: 'bar', max_gaps: 2 } });
    /* 整树级往返无损 */
    const t = parseTree({ query: { intervals: { title: cur.value.value as Record<string, unknown> } } });
    if (!t.ok) throw new Error('parse failed');
    expect(serializeTree(t.tree)).toEqual({ query: { intervals: { title: { match: { query: 'bar', max_gaps: 2 } } } } });
  });

  it('换类型 all_of → 容器形态；加子规则行递归渲染、子规则主值编辑写回嵌套结构', async () => {
    const { host, cur } = mount(mk({ match: { query: 'x' } }));
    const kind = host.querySelector<HTMLSelectElement>('.ivr-kind')!;
    kind.value = 'all_of';
    kind.dispatchEvent(new Event('change'));
    await tick();
    expect(cur.value.value).toEqual({ all_of: {} });
    (host.querySelector('.ivr-addkid') as HTMLElement).click();
    await tick();
    expect(cur.value.value).toEqual({ all_of: { intervals: [{ match: { query: '' } }] } });
    /* 递归子行主值编辑（深度+1 的 .ivr-main） */
    const sub = host.querySelectorAll<HTMLInputElement>('.ivr-kids .ivr-main')[0];
    sub.value = 'nested';
    sub.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({ all_of: { intervals: [{ match: { query: 'nested' } }] } });
  });

  it('位置过滤槽：加槽默认 containing + match 骨架，槽内子规则可编辑', async () => {
    const { host, cur } = mount(mk({ match: { query: 'x' } }));
    (host.querySelector('button[aria-label="位置过滤 filter"]') as HTMLElement).click();
    await tick();
    (host.querySelector('.ivr-addslot') as HTMLElement).click();
    await tick();
    expect(cur.value.value).toEqual({
      match: { query: 'x', filter: { containing: { match: { query: '' } } } },
    });
    const sub = host.querySelector<HTMLInputElement>('.ivr-fslot .ivr-main');
    sub!.value = 'water';
    sub!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({
      match: { query: 'x', filter: { containing: { match: { query: 'water' } } } },
    });
  });

  it('_name 编辑与删除（空串删键）；既有 _name 渲染', async () => {
    const { host, cur } = mount(mk({ match: { query: 'x' }, _name: 'nm' }));
    const name = host.querySelector<HTMLInputElement>('.ivr-name')!;
    expect(name.value).toBe('nm');
    name.value = 'renamed';
    name.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({ match: { query: 'x' }, _name: 'renamed' });
    name.value = '';
    name.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({ match: { query: 'x' } });
  });

  it('畸形规则体（多类型键）→ 退化通用键值表；chips 骨架键名官方 all_of/any_of', async () => {
    const { host } = mount(mk({ match: { query: 'x' }, any_of: { intervals: [] } }));
    expect(host.querySelector('.ivr'), '专用编辑器退场').toBeNull();
    expect(host.querySelector('.cn-objval .gp'), '通用键值表兜底').not.toBeNull();
    const chips = [...host.querySelectorAll('.cn-objk-btn')].map(b => b.textContent?.trim());
    expect(chips).toEqual(['+ match', '+ all_of', '+ any_of']);
  });

  it('既有递归 DSL 全量渲染：all_of 嵌 any_of 两子行、filter 槽标题计数', async () => {
    const v = {
      all_of: {
        intervals: [
          { match: { query: 'a' } },
          { any_of: { intervals: [{ prefix: { prefix: 'b' } }, { wildcard: { pattern: 'c*' } }] } },
        ],
        max_gaps: 2, ordered: true,
        filter: { not_overlapping: { match: { query: 'other' } } },
      },
    };
    const { host } = mount(mk(v));
    /* 递归全量渲染：根 all_of + match + any_of + prefix + wildcard（filter 槽未展开不渲染子行） */
    expect(host.querySelectorAll('.ivr-kind').length).toBe(5);
    const fltBtn = host.querySelector<HTMLButtonElement>('button[aria-label="位置过滤 filter"]')!;
    expect(fltBtn.title).toContain('1');
  });
});
