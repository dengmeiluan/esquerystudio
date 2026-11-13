import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, ref } from 'vue';
import ClauseNode from '../builder/ClauseNode.vue';
import { TREE_BUS } from '../builder/treeBus';
import type { LeafNode } from '../../utils/queryAst';

const mk = (patch: Partial<LeafNode> = {}): LeafNode => ({
  id: 't1', type: 'leaf', op: 'term', field: 'status', value: 'active', params: {}, raw: null, ...patch,
});

function mount(node: LeafNode, types: Record<string, string> = { status: 'keyword' }, bus?: { moves: unknown[][]; toggles: unknown[][] }) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(ClauseNode, {
      node: cur.value, fields: Object.keys(types), types,
      'onUpdate:node': (n: LeafNode) => { cur.value = n; },
    }),
  });
  if (bus) {
    app.provide(TREE_BUS, {
      move: (...args: unknown[]) => bus.moves.push(args),
      toggleDisabled: (id: string, disabled: boolean) => bus.toggles.push([id, disabled]),
      defineRuntime: () => false,
    });
  }
  app.mount(host);
  return { host, cur };
}

/* 1124：智能换算子只在「从候选弹层明确选中字段」时发生；输入半截不再换算子。
 测试用 helper：输入 → 等候选 → 点选目标项（等价真人从下拉选中）。 */
async function pickField(host: HTMLElement, value: string) {
  const inp = host.querySelector('.fs-inp') as HTMLInputElement;
  inp.focus();
  inp.value = value;
  inp.dispatchEvent(new Event('input'));
  await new Promise(r => setTimeout(r));
  const item = [...document.querySelectorAll('.fs-pop .fs-item')]
    .find(e => (e.textContent || '').includes(value)) as HTMLElement | undefined;
  expect(item, '候选 ' + value + ' 应出现在字段弹层').toBeTruthy();
  item!.click();
  await new Promise(r => setTimeout(r));
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

describe('ClauseNode', () => {
  it('渲染算子下拉与值输入', () => {
    const { host } = mount(mk());
    expect(host.querySelector('.cn-op')).not.toBeNull();
    expect((host.querySelector('.cn-val') as HTMLInputElement).value).toBe('active');
  });
  it('改值 emit 新节点（不可变更新）', async () => {
    const { host, cur } = mount(mk());
    const inp = host.querySelector('.cn-val') as HTMLInputElement;
    inp.value = 'inactive';
    inp.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    expect(cur.value.value).toBe('inactive');
    expect(cur.value.id).toBe('t1');
  });
  it('换字段后算子不合法时回落到该类型首算子', async () => {
    const { host, cur } = mount(mk({ op: 'match' }), { status: 'date' });
    await pickField(host, 'status');
    expect(cur.value.op).toBe('range');   // date 推荐首算子
  });
  it('exists 不渲染值输入', () => {
    const { host } = mount(mk({ op: 'exists', value: null }));
    expect(host.querySelector('.cn-val')).toBeNull();
  });
  it('range 渲染 gte/lte/gt/lt 四输入（W3b：开区间 gt/lt 补齐），gt/lt 编辑写回 range 对象', async () => {
    const { host, cur } = mount(mk({ op: 'range', field: 'createTime', value: { gte: 'now-7d', lte: 'now' } }));
    const ranges = host.querySelectorAll('.cn-range');
    expect(ranges.length, 'ES range 四操作符齐备（与 dslLint RANGE_OPS 同口径）').toBe(4);
    expect([...ranges].map(r => (r as HTMLInputElement).placeholder)).toEqual(['≥ gte', '≤ lte', '> gt', '< lt']);
    expect((ranges[0] as HTMLInputElement).value).toBe('now-7d');
    const gt = ranges[2] as HTMLInputElement;
    gt.value = '5';
    gt.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    expect(cur.value.value).toEqual({ gte: 'now-7d', lte: 'now', gt: '5' });
    const lt = ranges[3] as HTMLInputElement;
    lt.value = '';
    lt.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    expect(cur.value.value).toEqual({ gte: 'now-7d', lte: 'now', gt: '5' });
  });
  it('参与开关点击经 TREE_BUS 上抛（回归：首版 emit 无监听者，开关点了没反应）', async () => {
    const bus = { moves: [] as unknown[][], toggles: [] as unknown[][] };
    const { host } = mount(mk(), { status: 'keyword' }, bus);
    const off = host.querySelector('button[aria-label="临时停用（不参与匹配）"]') as HTMLButtonElement;
    expect(off).not.toBeNull();
    off.click();
    await new Promise(r => setTimeout(r));
    expect(bus.toggles).toEqual([['t1', true]]);
    // 停用态渲染恢复按钮（父级翻 disabled 后节点带 disabled=true）
    const { host: h2 } = mount(mk({ disabled: true }), { status: 'keyword' }, bus);
    const on = h2.querySelector('button[aria-label="恢复参与匹配"]') as HTMLButtonElement;
    expect(on).not.toBeNull();
    on.click();
    await new Promise(r => setTimeout(r));
    expect(bus.toggles[1]).toEqual(['t1', false]);
  });
  it('停用条件行整行降透明度提示', () => {
    const { host } = mount(mk({ disabled: true }));
    const row = host.querySelector('.cn') as HTMLElement;
    expect(row.style.opacity).toBe('0.45');
  });
  it('⏰ 转换按钮常驻（回归：按字段名门控时非时间字段看不到入口）', () => {
    const { host } = mount(mk({ field: 'status', op: 'term', value: 'active' }));
    expect(host.querySelector('button[aria-label="标准时间转时间戳"]')).not.toBeNull();
  });

  /* ==== 字段类型匹配：值输入 placeholder 按类型给形态提示（操作符侧已由 onField/opsForType 承担） ==== */

  it('值输入 placeholder 按字段类型匹配；未知类型/无 mapping 回落现状文案', () => {
    const ph = (types: Record<string, string>, patch: Partial<LeafNode> = {}) => {
      const { host } = mount(mk({ field: 'f', ...patch }), types);
      return (host.querySelector('.cn-val') as HTMLInputElement).placeholder;
    };
    expect(ph({ f: 'long' }), '数值字段给范围/数值提示').toBe('数值，如 ≥ 100');
    expect(ph({ f: 'date' }), '日期字段给 ⏰ 转换提示').toBe('日期或 epoch 毫秒（⏰ 可转换）');
    expect(ph({ f: 'keyword' }), 'keyword 给精确匹配提示').toBe('精确值（整串一致）');
    expect(ph({ f: 'text' }), 'text 给分词匹配提示').toBe('关键词（分词匹配）');
    expect(ph({ f: 'ip' }), 'ip 给 CIDR 网段提示（W3b 补分支）').toBe('IP 或 CIDR 网段（如 192.168.0.0/16）');
    /* boolean+term 的值位已换三态 select（无 placeholder）——placeholder 词条经非 term 算子验证 */
    expect(ph({ f: 'boolean' }, { op: 'match' })).toBe('true / false');
    expect(ph({}, { field: '' }), '无 mapping 零降级为现状文案').toBe('值（时间字段可用 ⏰ 转换）');
  });

  it('terms 多值 placeholder 优先于字段类型（多值语义主导；1005 随迁 chip 文案）', () => {
    const { host } = mount(mk({ field: 'f', op: 'terms', value: [] }), { f: 'keyword' });
    expect((host.querySelector('.cn-val') as HTMLInputElement).placeholder).toBe('输入值后回车或逗号添加');
  });

  it('字段类型徽标：渲染类型名 + 类型建议 tooltip；mapping 缺失不渲染（零降级）', () => {
    const { host } = mount(mk(), { status: 'keyword' });
    const b = host.querySelector('.cn-fty') as HTMLElement;
    expect(b.textContent).toBe('keyword');
    expect(b.title, 'tooltip 必须教育 keyword→term 精确匹配').toContain('term');
    const { host: h2 } = mount(mk({ field: 'ghost' }), {});
    expect(h2.querySelector('.cn-fty'), 'types 无此字段时不渲染徽标').toBeNull();
  });

  /* ==== 换字段静默换算子微提示（.cn-nudge）+ range-on-keyword 字典序黄点（.cn-rwarn） ==== */

  it('换字段算子不兼容被静默替换时行内微提示出现（aria-live=polite），兼容替换不提示', async () => {
    const { host, cur } = mount(mk({ op: 'match' }), { status: 'date' });
    await pickField(host, 'status');
    expect(cur.value.op).toBe('range');
    const nudge = host.querySelector('.cn-nudge') as HTMLElement;
    expect(nudge, '静默换算子必须行内告知').not.toBeNull();
    expect(nudge.textContent).toContain('已按 date 字段切换为');
    expect(nudge.textContent).toContain('范围');
    expect(nudge.getAttribute('aria-live')).toBe('polite');

    const h2 = mount(mk({ op: 'term' }), { status: 'keyword' });
    await pickField(h2.host, 'status');
    expect(h2.host.querySelector('.cn-nudge'), '算子兼容（term 仍在 keyword 推荐表）不提示').toBeNull();
  });

  it('微提示 2.5s 后进入淡出态、3s 后移除 DOM（双 timer，fake timers 推进）', async () => {
    vi.useFakeTimers();
    try {
      const { host } = mount(mk({ op: 'match' }), { status: 'date' });
      const inp = host.querySelector('.fs-inp') as HTMLInputElement;
      inp.value = 'status';
      inp.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(0);
      const item = [...document.querySelectorAll('.fs-pop .fs-item')]
        .find(e => (e.textContent || '').includes('status')) as HTMLElement | undefined;
      expect(item, '候选 status 应出现').toBeTruthy();
      item!.click();
      await vi.advanceTimersByTimeAsync(0);
      const nudge = host.querySelector('.cn-nudge') as HTMLElement;
      expect(nudge).not.toBeNull();
      expect(nudge.classList.contains('out'), '初始不淡出').toBe(false);
      await vi.advanceTimersByTimeAsync(2500);
      expect(nudge.classList.contains('out'), '2.5s 后进入淡出态（opacity 过渡）').toBe(true);
      await vi.advanceTimersByTimeAsync(600);
      expect(host.querySelector('.cn-nudge'), '3s 后移除 DOM（happy-dom 无 transitionend）').toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('range 打在 keyword/wildcard 字段显示字典序黄点警告（title 完整说明）；date/long 不显示', () => {
    const mkRange = (field: string) => mk({ op: 'range', field, value: { gte: 'a', lte: 'b' } });
    const { host } = mount(mkRange('status'), { status: 'keyword' });
    const w = host.querySelector('.cn-rwarn') as HTMLElement;
    expect(w, 'keyword + range 必须显示黄点').not.toBeNull();
    expect(w.title).toContain('字典序');
    expect(w.title).toContain("'100' < '20'");
    const h2 = mount(mkRange('status'), { status: 'wildcard' });
    expect(h2.host.querySelector('.cn-rwarn'), 'wildcard 同为字典序类型').not.toBeNull();
    const h3 = mount(mkRange('createTime'), { createTime: 'date' });
    expect(h3.host.querySelector('.cn-rwarn'), 'date 是 range 正主，不警示').toBeNull();
    const h4 = mount(mkRange('n'), { n: 'long' });
    expect(h4.host.querySelector('.cn-rwarn'), '数值类型不警示').toBeNull();
    const h5 = mount(mk({ op: 'term', field: 'status', value: 'x' }), { status: 'keyword' });
    expect(h5.host.querySelector('.cn-rwarn'), '非 range 算子不警示').toBeNull();
  });

  /* ==== 五百一十九批：手动选算子×类型错配黄点（.cn-owarn）+ wildcard 类型词条 ==== */

  it('手动选不兼容算子显示黄点（title 建议兼容算子，友好不阻断）；兼容算子不显示', () => {
    const { host } = mount(mk({ op: 'term', field: 'createTime', value: 123 }), { createTime: 'date' });
    const w = host.querySelector('.cn-owarn') as HTMLElement;
    expect(w, 'date + term 错配必须显示黄点').not.toBeNull();
    expect(w.title).toContain('date 字段建议');
    expect(w.title).toContain('range');
    expect(w.title).toContain('可能无结果');
    /* 五百二十五批随迁：span 升级 button（一键改推荐算子），语义由 aria-label 承载 */
    expect(w.getAttribute('aria-label')).toBe('改用推荐算子');
    const h2 = mount(mk({ op: 'range', field: 'createTime', value: { gte: 1 } }), { createTime: 'date' });
    expect(h2.host.querySelector('.cn-owarn'), 'date + range 兼容不警示').toBeNull();
    const h3 = mount(mk({ op: 'match', field: 'title', value: 'x' }), { title: 'text' });
    expect(h3.host.querySelector('.cn-owarn'), 'text + match 兼容不警示').toBeNull();
    const h4 = mount(mk({ op: 'exists', field: 'createTime', value: null }), { createTime: 'date' });
    expect(h4.host.querySelector('.cn-owarn'), 'exists 万能兜底豁免').toBeNull();
  });

  /* ==== 五百二十五批：错配黄点一键改推荐算子（span 升级 button，键盘可达） ==== */

  it('五百二十五批：点黄点一键切到该类型推荐首算子（date+term→range）；保留 title 文案', async () => {
    const { host, cur } = mount(mk({ op: 'term', field: 'createTime', value: 123 }), { createTime: 'date' });
    const w = host.querySelector('button.cn-owarn') as HTMLButtonElement;
    expect(w, '黄点必须是 button（可点）').not.toBeNull();
    expect(w.getAttribute('aria-label')).toBe('改用推荐算子');
    expect(w.title, '完整说明保留在 title').toContain('date 字段建议');
    w.click();
    await new Promise(r => setTimeout(r));
    expect(cur.value.op, '点击必须切到 date 推荐首算子 range（exists 兜底除外）').toBe('range');
    expect(cur.value.value, 'range ↔ 标量互转给安全初值（onOp 既有语义）').toEqual({});
    expect(cur.value.field, '换算子保留字段').toBe('createTime');
  });

  it('wildcard 类型徽标有专属词条 tooltip；prefix/wildcard 值开头 * ? 黄点提示（prefix-wildcard 语义）', () => {
    const { host } = mount(mk({ op: 'wildcard', value: '*x' }), { status: 'wildcard' });
    const b = host.querySelector('.cn-fty') as HTMLElement;
    expect(b.title, 'wildcard 类型词条必须教育通配符用法').toContain('通配');
    const w = host.querySelector('.cn-owarn') as HTMLElement;
    expect(w, '开头 * 必须黄点').not.toBeNull();
    expect(w.title).toContain('全表扫描');
    const h2 = mount(mk({ op: 'wildcard', value: 'x*' }), { status: 'wildcard' });
    expect(h2.host.querySelector('.cn-owarn'), '结尾 * 是合法通配不警示').toBeNull();
    const h3 = mount(mk({ op: 'prefix', value: '?x' }), { status: 'keyword' });
    expect(h3.host.querySelector('.cn-owarn'), 'prefix 开头 ? 同样警示').not.toBeNull();
  });

  /* ==== 【W3b】boolean 字段 term 三态值控件（true/false/空；空=删键即删除该条件） ==== */

  function mountWithRemove(node: LeafNode, types: Record<string, string>) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cur = ref(node);
    let removed = 0;
    createApp({
      render: () => h(ClauseNode, {
        node: cur.value, fields: Object.keys(types), types,
        'onUpdate:node': (n: LeafNode) => { cur.value = n; },
        onRemove: () => { removed++; },
      }),
    }).mount(host);
    return { host, cur, removed: () => removed };
  }

  it('boolean+term 值位换三态 select：选 true/false 写回布尔值', async () => {
    const { host, cur } = mountWithRemove(mk({ op: 'term', field: 'flag', value: '' }), { flag: 'boolean' });
    const sel = host.querySelector('.cn-bool') as HTMLSelectElement;
    expect(sel, 'boolean+term 必须渲染三态 select（.cn-bool）').not.toBeNull();
    expect(sel.className, '样式对齐 .cn-val：select 挂 .cn-val 类').toContain('cn-val');
    sel.value = 'true';
    sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r));
    expect(cur.value.value, 'true 直接可选，不再手打').toBe(true);
    sel.value = 'false';
    sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r));
    expect(cur.value.value).toBe(false);
  });

  it('boolean+term 非 term 算子不换 select（零意外面）；选「（空）」= 删键 emit remove', async () => {
    const h0 = mountWithRemove(mk({ op: 'match', field: 'flag', value: 'x' }), { flag: 'boolean' });
    expect(h0.host.querySelector('.cn-bool'), '只有 term 换三态 select').toBeNull();

    const { host, removed } = mountWithRemove(mk({ op: 'term', field: 'flag', value: true }), { flag: 'boolean' });
    const sel = host.querySelector('.cn-bool') as HTMLSelectElement;
    expect(sel.value, '当前值 true 回显选中').toBe('true');
    sel.value = '';
    sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r));
    expect(removed(), '无值 term 无查询语义：选空=删除该条件（走父级 remove 链）').toBe(1);
  });
});

describe('1005 terms/ids 值 chip 视觉化', () => {
  const tick = () => new Promise(r => setTimeout(r));
  const chipInput = (host: HTMLElement) => host.querySelector<HTMLInputElement>('.cn-chip-in')!;
  const setDraft = (inp: HTMLInputElement, v: string) => { inp.value = v; inp.dispatchEvent(new Event('input')); };

  it('数组值渲染为 chips；删 chip 写回数组（不可变更新）', async () => {
    const { host, cur } = mount(mk({ field: 'tag', op: 'terms', value: ['a', 'b', 'c'] }), { tag: 'keyword' });
    const chips = () => Array.from(host.querySelectorAll('.cn-chip-v')).map(el => el.textContent);
    expect(chips()).toEqual(['a', 'b', 'c']);
    (host.querySelectorAll('.cn-chip-x')[1] as HTMLElement).click();
    await tick();
    expect(chips()).toEqual(['a', 'c']);
    expect(cur.value.value).toEqual(['a', 'c']);
  });

  it('输入回车添加；英文/中文逗号即刻提交；粘贴含逗号拆多项', async () => {
    const { host, cur } = mount(mk({ field: 'tag', op: 'terms', value: ['a'] }), { tag: 'keyword' });
    const inp = chipInput(host);
    setDraft(inp, 'b');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await tick();
    expect(cur.value.value).toEqual(['a', 'b']);
    setDraft(inp, 'c');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: '，' }));
    await tick();
    expect(cur.value.value).toEqual(['a', 'b', 'c']);
    setDraft(inp, 'd,e');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: ',' }));
    await tick();
    expect(cur.value.value, '粘贴含逗号拆项（与旧逗号分隔输入等价）').toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('空输入 Backspace 删末项；IME 组合态 Enter 不提交', async () => {
    const { host, cur } = mount(mk({ field: 'tag', op: 'terms', value: ['x', 'y'] }), { tag: 'keyword' });
    const inp = chipInput(host);
    expect(inp.value).toBe('');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
    await tick();
    expect(cur.value.value, '空输入退格删末项').toEqual(['x']);
    setDraft(inp, '半');
    inp.dispatchEvent(new CompositionEvent('compositionstart'));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    await tick();
    expect(cur.value.value, 'IME 组合态 Enter 不提交半截值').toEqual(['x']);
    inp.dispatchEvent(new CompositionEvent('compositionend'));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await tick();
    expect(cur.value.value).toEqual(['x', '半']);
  });

  it('空数组=纯输入框无 chips；placeholder 新文案（旧逗号话术防回潮）', () => {
    const { host } = mount(mk({ field: 'tag', op: 'terms', value: [] }), { tag: 'keyword' });
    expect(host.querySelectorAll('.cn-chip')).toHaveLength(0);
    const ph = (host.querySelector('.cn-val') as HTMLInputElement).placeholder;
    expect(ph).toBe('输入值后回车或逗号添加');
    expect(ph).not.toBe('逗号分隔多值');
  });

  it('ids 同构 chip（数组值算子族一致）', async () => {
    const { host, cur } = mount(mk({ field: null, op: 'ids', value: ['1', '2'] }), {});
    expect(Array.from(host.querySelectorAll('.cn-chip-v')).map(el => el.textContent)).toEqual(['1', '2']);
    const inp = chipInput(host);
    setDraft(inp, '3');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await tick();
    expect(cur.value.value).toEqual(['1', '2', '3']);
  });
});

/* 1124：输入半截字段不再被当成「未知字段」换算子；只有候选选中才做类型智能切换 */
describe('1124 字段输入与算子切换解耦', () => {
  it('rank_feature 输入半截/未知字段保持算子；选中 rank_features 字段仍保持', async () => {
    const { host, cur } = mount(mk({ op: 'rank_feature', field: '', value: 1 }), { status: 'keyword', rank_score: 'rank_features' });
    const inp = host.querySelector('.fs-inp') as HTMLInputElement;
    inp.value = 'ran';
    inp.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    expect(cur.value.op, '半截输入不得降为 exists').toBe('rank_feature');
    await pickField(host, 'rank_score');
    expect(cur.value.op).toBe('rank_feature');
    const inp2 = host.querySelector('.fs-inp') as HTMLInputElement;
    inp2.value = 'ghost';
    inp2.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    expect(cur.value.op, '未知字段也不得静默换算子').toBe('rank_feature');
  });

  it('distance_feature 的 pivot 字符串切到 rank_feature：boost 回落 1（不留 7d 非法串）', async () => {
    const { host, cur } = mount(mk({ op: 'distance_feature', field: 'publish_time', value: '7d' }), { publish_time: 'date' });
    const sel = host.querySelector('.cn-op') as HTMLSelectElement;
    sel.value = 'rank_feature';
    sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r));
    expect(cur.value.op).toBe('rank_feature');
    expect(cur.value.value).toBe(1);
  });
});

/* 1045 ClauseNode 智能值守卫 */
describe('1045 ClauseNode 智能值守卫', () => {
  const tick = () => new Promise(r => setTimeout(r));

  it('keyword term → date 字段：算子回落 range 且旧标量值不残留为 range 值', async () => {
    const { host, cur } = mount(mk({ field: 'status', op: 'term', value: 'active' }), { status: 'keyword', pub: 'date' });
    await pickField(host, 'pub');
    expect(cur.value.op).toBe('range');
    expect(cur.value.value).toEqual({});   // 旧 'active' 不得成为 {range:{pub:'active'}}
    const ranges = host.querySelectorAll('.cn-range') as NodeListOf<HTMLInputElement>;
    expect(ranges.length).toBe(4);
    expect([...ranges].every(r => r.value === '')).toBe(true);
  });

  it('空值 term → date 字段：值形态也必须落 {}（不能留空串让 DSL 出现 range:""）', async () => {
    const { host, cur } = mount(mk({ field: 'status', op: 'term', value: '' }), { status: 'keyword', pub: 'date' });
    await pickField(host, 'pub');
    expect(cur.value.op).toBe('range');
    expect(cur.value.value).toEqual({});
  });

  it('单值位粘贴 Excel 一列/换行文本 → 自动升为 terms 多值精确', async () => {
    const { host, cur } = mount(mk({ field: 'tag', op: 'term', value: '' }), { tag: 'keyword' });
    const inp = host.querySelector('.cn-val') as HTMLInputElement;
    const ev = new Event('paste', { bubbles: true }) as any;
    Object.defineProperty(ev, 'clipboardData', { value: { getData: () => 'alpha\nbeta\n"gamma"' } });
    inp.dispatchEvent(ev);
    await tick();
    expect(cur.value.op).toBe('terms');
    expect(cur.value.value).toEqual(['alpha', 'beta', 'gamma']);
    expect(host.querySelectorAll('.cn-chip').length).toBe(3);
  });

  it('单值位粘贴 JSON 数组 → 按项落入 terms', async () => {
    const { host, cur } = mount(mk({ field: 'tag', op: 'term', value: '' }), { tag: 'keyword' });
    const inp = host.querySelector('.cn-val') as HTMLInputElement;
    const ev = new Event('paste', { bubbles: true }) as any;
    Object.defineProperty(ev, 'clipboardData', { value: { getData: () => '["a","b"]' } });
    inp.dispatchEvent(ev);
    await tick();
    expect(cur.value.op).toBe('terms');
    expect(cur.value.value).toEqual(['a', 'b']);
  });
});

/* 1045 批：向量查询值 JSON 编辑位（knn 数组 / sparse_vector 对象） */
describe('1045 ClauseNode 向量值编辑', () => {
  const tick = () => new Promise(r => setTimeout(r));

  it('knn query_vector 数组渲染 JSON 编辑区；合法改动写树，半截标红不写', async () => {
    const { host, cur } = mount(mk({ op: 'knn', field: 'emb', value: [0.1, 0.2] }), { emb: 'dense_vector' });
    const ta = host.querySelector<HTMLTextAreaElement>('.cn-perc');
    expect(ta, '向量值不得落 String(array) 标量输入').toBeTruthy();
    expect(ta!.value).toBe('[\n  0.1,\n  0.2\n]');
    ta!.value = '[0.3, 0.4]';
    ta!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual([0.3, 0.4]);
    expect(ta!.classList.contains('bad')).toBe(false);
    ta!.value = '[0.3,';
    ta!.dispatchEvent(new Event('input'));
    await tick();
    expect(ta!.classList.contains('bad')).toBe(true);
    expect(cur.value.value, '半截 JSON 不写树').toEqual([0.3, 0.4]);
  });

  it('sparse_vector query_vector 对象同用 JSON 编辑区', async () => {
    const { host, cur } = mount(mk({ op: 'sparse_vector', field: 'ml.tokens', value: { 债: 2.1 } }), { 'ml.tokens': 'sparse_vector' });
    const ta = host.querySelector<HTMLTextAreaElement>('.cn-perc')!;
    expect(ta.value).toContain('"债": 2.1');
    ta.value = '{"债": 1.5, "券": 0.8}';
    ta.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({ 债: 1.5, 券: 0.8 });
  });
});
