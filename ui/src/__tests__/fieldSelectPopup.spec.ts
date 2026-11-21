/**
 * FieldSelect 换代渗透网：builder 字段选择器接入 usePopupList 骨架 + fieldSearch 共享内核后，
 * 锁定：① 键盘 ↑↓/Enter/Home/End 与 Esc/点击外部关闭；② IME 组合态守卫；
 * ③ rank 排序（精确>前缀>包含）；④ 类型分组+组头+data-t 三色徽标；⑤ <mark> 无 v-html 高亮；
 * ⑥ 候选计数与 cap 提示；⑦ per-index 最近字段记忆（读不到回退全局）；
 * ⑧ defaultLeaf 记忆（最近字段+兼容算子）；⑨ QueryTreePane 计数徽标/克隆插入；
 * ⑩ BoolGroupNode 折叠摘要；⑪ 字段选择器伸展守卫。
 * 范式同 fieldSelect.spec.ts：createApp 手工 mount，无 @vue/test-utils；弹层 Teleport 到 body。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, ref, nextTick, type App } from 'vue';
import FieldSelect from '../components/builder/FieldSelect.vue';
import QueryTreePane from '../components/builder/QueryTreePane.vue';
import { setFieldSearchIndex } from '../utils/fieldSearch';
import { parseTree, serializeTree, nid, type QueryTree, type QueryNode } from '../utils/queryAst';
import { DRAG_KEY } from '../components/builder/treeBus';

const apps: App[] = [];

async function settle(n = 6) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

function mountSelect(opts: { fields?: string[]; types?: Record<string, string>; model?: string } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const val = ref(opts.model ?? '');
  const app = createApp({
    render: () => h(FieldSelect, {
      modelValue: val.value,
      fields: opts.fields ?? [],
      types: opts.types ?? {},
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

/* 弹层 Teleport 到 body，统一查 document.body */
const pop = () => document.body.querySelector('.fs-pop');
const items = () => Array.from(document.body.querySelectorAll<HTMLElement>('.fs-item'));
const names = () => Array.from(document.body.querySelectorAll('.fs-item .fs-nm')).map(el => el.textContent);
const inp = (host: ParentNode) => host.querySelector<HTMLInputElement>('.fs-inp')!;
async function focus(host: ParentNode) { inp(host).dispatchEvent(new Event('focus')); await settle(); }
async function type(host: ParentNode, v: string) { inp(host).value = v; inp(host).dispatchEvent(new Event('input')); await settle(); }
async function key(host: ParentNode, k: string, init: KeyboardEventInit = {}) {
  inp(host).dispatchEvent(new KeyboardEvent('keydown', { key: k, ...init }));
  await settle();
}
const actIdx = () => items().findIndex(el => el.classList.contains('act'));

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  setFieldSearchIndex('');            // 模块级索引上下文逐用例复位（per-index 记忆隔离）
  delete (window as any)[DRAG_KEY];
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('FieldSelect 换代：usePopupList 骨架', () => {
  it('键盘导航：↓/↑/Home/End 移动高亮，Enter 选中回填并收面板', async () => {
    const { host, val } = mountSelect({ fields: ['alpha', 'beta', 'gamma'] });
    await focus(host);
    expect(actIdx(), '打开默认高亮首项').toBe(0);
    await key(host, 'ArrowDown');
    expect(actIdx(), '↓ 落到第二项').toBe(1);
    await key(host, 'End');
    expect(actIdx(), 'End 跳末项').toBe(2);
    await key(host, 'Home');
    expect(actIdx(), 'Home 跳首项').toBe(0);
    await key(host, 'ArrowDown');
    await key(host, 'ArrowDown');
    await key(host, 'Enter');
    expect(val.value, 'Enter 必须选中高亮项').toBe('gamma');
    await settle();
    expect(pop(), '选择后面板必须关闭').toBeNull();
  });

  it('Esc 关闭；点击外部（document mousedown）关闭', async () => {
    const { host } = mountSelect({ fields: ['a'] });
    await focus(host);
    expect(pop()).toBeTruthy();
    await key(host, 'Escape');
    expect(pop(), 'Esc 后弹层必须关闭').toBeNull();
    await focus(host);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await settle();
    expect(pop(), '外部 mousedown 后弹层必须关闭').toBeNull();
  });

  it('IME 组合态 Enter 守卫：isComposing keydown 不替换手输、不收面板；组合结束后 Enter 正常选中', async () => {
    const { host, val } = mountSelect({ fields: ['status'], model: 'stat' });
    await type(host, 'stat');
    inp(host).dispatchEvent(new CompositionEvent('compositionstart'));
    inp(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    await settle();
    expect(val.value, 'IME 组合态 Enter 不许替换手输值').toBe('stat');
    expect(pop(), 'IME 组合态 Enter 后弹层保持打开').toBeTruthy();
    inp(host).dispatchEvent(new CompositionEvent('compositionend'));
    await key(host, 'Enter');
    expect(val.value, '组合结束后 Enter 正常选中').toBe('status');
  });
});

describe('FieldSelect 换代：fieldSearch 共享内核', () => {
  it('rank 排序：精确 > 前缀 > 包含，同级字母序', async () => {
    const { host } = mountSelect({ fields: ['user.name', 'name', 'nickname'] });
    await focus(host);
    await type(host, 'name');
    expect(names(), '精确 name 最前，前缀/包含按字母序').toEqual(['name', 'nickname', 'user.name']);
  });

  /* 1170：段感知排序——真挂载，锁的是「用户在下拉里看到的顺序」。
     此前只比整串，code 下 encode_flag 与 bond_code 同档按字母序，前者反而更靠前。 */
  it('段边界整段命中优先于段内子串：code → bond_code/pub_code 压过 encode_flag', async () => {
    const { host } = mountSelect({
      fields: ['bond_code', 'encode_flag', 'pub_code', 'publish_code_x', 'publisher.org_code'],
    });
    await focus(host);
    await type(host, 'code');
    const got = names();
    const enc = got.indexOf('encode_flag');
    expect(enc, 'encode_flag 必须仍在候选里（不删候选，只排序）').toBeGreaterThan(-1);
    for (const w of ['bond_code', 'pub_code']) {
      expect(got.indexOf(w), `${w} 必须排在 encode_flag 之前`).toBeLessThan(enc);
    }
    expect(got[0]).not.toBe('encode_flag');
  });

  it('不同词根不得抢先：publish → publish* 全族排在 publisher.* 之前', async () => {
    const { host } = mountSelect({
      fields: ['publisher.org_name', 'publisher.org_code', 'publish_date', 'publishTime'],
    });
    await focus(host);
    await type(host, 'publish');
    const got = names();
    const firstPublisher = Math.min(got.indexOf('publisher.org_name'), got.indexOf('publisher.org_code'));
    for (const w of ['publish_date', 'publishTime']) {
      expect(got.indexOf(w), `${w} 必须排在 publisher.* 之前`).toBeLessThan(firstPublisher);
    }
  });

  it('类型分组+组头+data-t 三色徽标（组序=字母序首现序）', async () => {
    const { host } = mountSelect({
      fields: ['created', 'status', 'user', 'user.name'],
      types: { created: 'date', status: 'keyword', user: 'object', 'user.name': 'text' },
    });
    await focus(host);
    const gh = Array.from(document.body.querySelectorAll('.fs-gh')).map(el => el.textContent);
    /* 558b 同步更新：组头人话词面升级（GH_LABEL→FIELD_TYPE_ZH 兜底）——锁语义=组头人话，
         date 走 GH_LABEL 既有档不变，keyword/object/text 出 FIELD_TYPE_ZH 实词 */
    expect(gh).toEqual(['日期 字段', '精确值 字段', '对象 字段', '文本 字段']);
    const tags = Array.from(document.body.querySelectorAll('.fs-item .fs-ty')).map(el => (el as HTMLElement).dataset.t);
    expect(tags).toEqual(['date', 'keyword', 'object', 'text']);
  });

  it('输入命中 <mark> 高亮：按切分片段渲染（无 v-html），textContent 与原路径一致', async () => {
    const { host } = mountSelect({ fields: ['user.name'], types: { 'user.name': 'text' } });
    await focus(host);
    await type(host, 'name');
    const nm = document.body.querySelector('.fs-item .fs-nm')!;
    const mark = nm.querySelector('mark');
    expect(mark, '匹配片段必须 <mark> 高亮').toBeTruthy();
    expect(mark!.textContent).toBe('name');
    expect(nm.textContent, '片段拼接必须还原完整路径').toBe('user.name');
  });

  it('候选计数与虚拟滚动：页脚显示全部命中数（无截断话术），窗口渲染可滚动浏览全部', async () => {
    const fields = Array.from({ length: 40 }, (_, i) => 'f' + String(i).padStart(2, '0'));
    const { host } = mountSelect({ fields });
    await focus(host);
    /* 1004：CAP=30 硬顶退役为可视区窗口渲染——40 个匹配全部可达，DOM 只出窗口子集 */
    const n = items().length;
    expect(n, 'DOM 只渲染窗口子集（非全量 40）').toBeLessThan(40);
    expect(n, '窗口至少覆盖首屏+缓冲').toBeGreaterThanOrEqual(9);
    const ft = document.body.querySelector('.fs-ft')!.textContent!;
    expect(ft).toContain('40 个匹配');
    expect(ft, '截断话术退役（防回潮）').not.toContain('仅显示前');
    /* End 跳末项：光标窗口跟随，末项必须渲染在场且高亮 */
    await key(host, 'End');
    const its = items();
    const last = its[its.length - 1];
    expect(actIdx(), 'End 后末项高亮在场').toBe(its.length - 1);
    expect(names()[its.length - 1], '末项=字典序末位 f39').toBe('f39');
    expect(inp(host).getAttribute('aria-activedescendant'), 'aria-activedescendant 指向在场末项')
      .toBe(last!.id);
    /* 列表盒语义：窗口化下 aria-setsize=全集、posinset=窗口内项的真实序 */
    expect(last!.getAttribute('aria-setsize')).toBe('40');
    expect(last!.getAttribute('aria-posinset')).toBe('40');
    /* Enter 选中窗口深处末项（跨窗口可达性） */
    await key(host, 'Enter');
    expect((host as HTMLElement).querySelector<HTMLInputElement>('.fs-inp')!.value, 'End+Enter 必须选中末项').toBe('f39');
    /* 收窄查询 → 小集合窗口全覆盖（无窗口化残留），计数为全集 */
    const { host: h2 } = mountSelect({ fields });
    await focus(h2);
    await type(h2, 'f0');
    expect(items().length, '10 个命中全渲染（窗口覆盖小集合）').toBe(10);
    expect(document.body.querySelector('.fs-ft')!.textContent!).toContain('10 个匹配');
  });

  it('per-index 最近使用置顶：key 拼索引写 per-index 键，全局键不动；读不到回退全局', async () => {
    setFieldSearchIndex('idx-a');
    const { host } = mountSelect({ fields: ['alpha', 'beta'] });
    await focus(host);
    items()[0].click();
    await settle();
    expect(JSON.parse(localStorage.getItem('esquerystudio_qb_field_recent::idx-a') || '[]'), '必须写 per-index 键').toEqual(['alpha']);
    expect(localStorage.getItem('esquerystudio_qb_field_recent'), '全局键必须不动').toBeNull();
    /* per-index 无记录 → 回退读全局（老记录不丢）：全局最近字段置顶 */
    localStorage.clear();
    localStorage.setItem('esquerystudio_qb_field_recent', JSON.stringify(['beta']));
    setFieldSearchIndex('idx-b');
    const { host: h2 } = mountSelect({ fields: ['alpha', 'beta'] });
    await focus(h2);
    expect(names()[0], '全局回退记录必须置顶').toBe('beta');
  });
});

describe('defaultLeaf 记忆与面板增强', () => {
  it('「加条件」默认叶子优先取本索引最近字段+其兼容算子；无记录回退 fields[0]+term', async () => {
    localStorage.setItem('esquerystudio_qb_field_recent::idx-a', JSON.stringify(['b']));
    const { host, tree } = mountTree({ query: { match_all: {} } },
      { fields: ['a', 'b', 'c'], types: { a: 'keyword', b: 'date', c: 'keyword' }, index: 'idx-a' });
    (host.querySelector('.qtp-none button') as HTMLElement).click();
    await settle();
    const leaf = (tree.value.root as any).children[0].node;
    expect(leaf.field, '必须取最近使用的字段 b').toBe('b');
    expect(leaf.op, '必须取 date 类型兼容首算子 range').toBe('range');
    /* 无记录回退：fields[0] + keyword→term（既有现状） */
    localStorage.removeItem('esquerystudio_qb_field_recent::idx-a');
    const r2 = mountTree({ query: { match_all: {} } },
      { fields: ['a', 'b', 'c'], types: { a: 'keyword', b: 'date', c: 'keyword' }, index: 'idx-a' });
    (r2.host.querySelector('.qtp-none button') as HTMLElement).click();
    await settle();
    const leaf2 = (r2.tree.value.root as any).children[0].node;
    expect(leaf2.field).toBe('a');
    expect(leaf2.op).toBe('term');
  });

  it('面板头部「共 N 条件」计数徽标：递归数嵌套叶子', () => {
    const { host } = mountTree({
      query: { bool: { must: [{ term: { a: 1 } }, { bool: { should: [{ term: { b: 2 } }] } }], filter: [{ range: { c: { gte: 1 } } }] } },
    });
    expect(host.querySelector('.qtp-cnt')!.textContent).toContain('共 3 条件');
  });

  it('条件行「复制」：深拷贝重派 id 后插到原节点之后（同 occur 分区）', async () => {
    const { host, tree } = mountTree({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }] } } });
    const row0 = host.querySelectorAll('.cn')[0];
    (row0.querySelector('button[title^="复制条件"]') as HTMLElement).click();
    await settle();
    const ser = serializeTree(tree.value);
    expect(ser.query).toEqual({ bool: { must: [{ term: { a: 1 } }, { term: { a: 1 } }, { term: { b: 2 } }] } });
    const ids: string[] = [];
    const walk = (n: QueryNode) => {
      ids.push(n.id);
      if (n.type === 'bool') n.children.forEach(c => walk(c.node));
    };
    walk(tree.value.root!);
    expect(new Set(ids).size, '克隆后所有 id 必须重新生成').toBe(ids.length);
    expect(host.querySelectorAll('.cn').length).toBe(3);
  });

  it('根组「复制整组」：root 命中包一层 bool.must（原组在前、克隆在后）', async () => {
    const { host, tree } = mountTree({ query: { bool: { must: [{ term: { a: 1 } }] } } });
    (host.querySelector('.bgn-hd button[aria-label="复制整组"]') as HTMLElement).click();
    await settle();
    expect(serializeTree(tree.value)).toEqual({
      query: { bool: { must: [{ bool: { must: [{ term: { a: 1 } }] } }, { bool: { must: [{ term: { a: 1 } }] } }] } },
    });
  });

  it('bool 组折叠/展开：折叠态隐藏分区并显示 occur 摘要（内存态不持久化）', async () => {
    const { host } = mountTree({
      query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }], filter: [{ term: { c: 3 } }] } },
    });
    const tick = () => new Promise(r => setTimeout(r));
    expect(host.querySelectorAll('.bgn-part').length).toBe(2);
    (host.querySelector('.bgn-hd button[aria-label="折叠或展开整组"]') as HTMLElement).click();
    await tick();
    expect(host.querySelectorAll('.bgn-part').length, '折叠后分区必须隐藏').toBe(0);
    expect(host.querySelector('.bgn-sum')!.textContent, '折叠态必须出 occur 摘要').toBe('must(2) filter(1)');
    (host.querySelector('.bgn-hd button[aria-label="折叠或展开整组"]') as HTMLElement).click();
    await tick();
    expect(host.querySelectorAll('.bgn-part').length, '再点展开恢复').toBe(2);
  });

  it('字段选择器伸展守卫：.cn 行内 .fs 吃满剩余空间（长路径不截断）', () => {
    const s = readFileSync(join(__dirname, '../components/builder/ClauseNode.vue'), 'utf-8');
    expect(s).toMatch(/\.cn \.fs \{ flex: 1 1 150px; min-width: 0; \}/);
  });

  /* ==== 右键菜单：候选行选用/复制（共享 CellContextMenu；键盘 ContextMenu 同入口） ==== */
  it('候选行右键：标题带字段+类型，复制字段名走剪贴板；键盘 ContextMenu 开同一菜单并选用', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { host, val } = mountSelect({ fields: ['message', 'status'], types: { message: 'text', status: 'keyword' } });
    await focus(host);
    items()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 12, clientY: 24 }));
    await settle();
    const menu = document.body.querySelector('.ccm') as HTMLElement;
    expect(menu, '右键必须出共享 CellContextMenu').toBeTruthy();
    expect(menu.querySelector('.ccm-hd')!.textContent).toContain('message');
    expect(menu.querySelector('.ccm-hd')!.textContent).toContain('text');
    (menu.querySelector('[data-key="field-copy"]') as HTMLElement).click();
    await settle(3);
    expect(writeText).toHaveBeenCalledWith('message');
    delete (navigator as any).clipboard;

    await key(host, 'ContextMenu');
    const menu2 = document.body.querySelector('.ccm') as HTMLElement;
    expect(menu2, 'ContextMenu 键必须对高亮候选项开菜单').toBeTruthy();
    expect(menu2.querySelector('.ccm-hd')!.textContent).toContain('message');
    (menu2.querySelector('[data-key="field-pick"]') as HTMLElement).click();
    await settle();
    expect(val.value, '菜单选用必须回填字段').toBe('message');
    await settle();
    expect(pop(), '选用后面板必须关闭').toBeNull();
  });
});

/* nid 引用防抖：克隆 id 重派依赖 nid（静态守卫，防未来误删 import） */
it('nid 唯一性冒烟', () => {
  expect(nid()).not.toBe(nid());
});
