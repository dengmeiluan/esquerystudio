/* 1036 批：跨查询子树复制粘贴——建好的复杂条件在任意查询/索引/刷新后复用。
   queryStash 单源（sessionStorage 暂存 serQueryNode 文本 + 响应式 stash ref）；
   ClauseNode「复制子树」钮入暂存（nudge 反馈）；BoolGroupNode 分区头「粘贴」钮
   （stash 非空显形）+ QueryTreePane 空态「粘贴子树」——粘贴=parseQueryNode 重建
   全新 id 零纠缠；损坏暂存静默降级。AST 零改动。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serQueryNode, parseQueryNode, type LeafNode } from '../utils/queryAst';
import { copySubtreeToStash, readStashSubtree, subtreeStash } from '../utils/queryStash';

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

const LEAF: LeafNode = { id: 'n1', type: 'leaf', op: 'term', field: 'order_no', value: 'A1', params: { boost: 2 }, raw: null };
const SUBTREE = { id: 'b1', type: 'bool' as const, children: [
  { occur: 'must' as const, node: LEAF },
  { occur: 'filter' as const, node: { id: 'n2', type: 'leaf' as const, op: 'range', field: 'created_at', value: { gte: 'now-7d' }, params: {}, raw: null } },
], params: {}, arrForm: { must: true, filter: true } };

describe('1036 queryStash 单源', () => {
  beforeEach(() => {
    sessionStorage.removeItem('esquerystudio.qb.subtree');
    subtreeStash.value = null;
  });
  it('复制入暂存：sessionStorage 键与响应式 ref 同步、文本为序列化子树', () => {
    expect(copySubtreeToStash(SUBTREE as any)).toBe(true);
    expect(subtreeStash.value).toBeTruthy();
    expect(sessionStorage.getItem('esquerystudio.qb.subtree')).toBe(subtreeStash.value);
    expect(sessionStorage.getItem('esquerystudio.qb.subtree')).toContain('"term"');
  });
  it('读暂存=全新节点（id 重生成、序列化等值——零纠缠契约）', () => {
    copySubtreeToStash(SUBTREE as any);
    const parsed = readStashSubtree();
    expect(parsed).toBeTruthy();
    expect(parsed!.id).not.toBe(SUBTREE.id);
    expect(JSON.parse(JSON.stringify(serQueryNode(parsed!)))).toEqual(JSON.parse(JSON.stringify(serQueryNode(SUBTREE as any))));
  });
  it('损坏暂存静默降级 null', () => {
    subtreeStash.value = '{broken json';
    expect(readStashSubtree()).toBeNull();
    subtreeStash.value = '"just a string"';
    expect(readStashSubtree()).toBeNull();
  });
  it('空暂存返回 null（粘贴钮显隐契约）', () => {
    expect(subtreeStash.value).toBeNull();
    expect(readStashSubtree()).toBeNull();
  });
});

describe('1036 三站接线源码锁', () => {
  it('ClauseNode 复制子树钮（copySubtreeToStash + nudge 反馈）', () => {
    const src = srcOf('components/builder/ClauseNode.vue');
    expect(src).toContain('aria-label="复制子树（跨查询粘贴用）"');
    expect(src).toContain('copySubtreeToStash(props.node)');
    expect(src).toContain('已复制子树');
  });
  it('BoolGroupNode 分区粘贴钮（stash 非空显形 + parse 重建追加分区尾）+ 组级复制钮', () => {
    const src = srcOf('components/builder/BoolGroupNode.vue');
    expect(src).toContain('v-if="stashNonEmpty"');
    expect(src).toContain('readStashSubtree()');
    expect(src).toContain('aria-label="复制组子树（跨查询粘贴用）"');
    expect(src).toContain('copySubtreeToStash(props.node)');
  });
  it('QueryTreePane 空态粘贴（落 bool.must 条件组）', () => {
    const src = srcOf('components/builder/QueryTreePane.vue');
    expect(src).toContain('粘贴子树');
    expect(src).toContain('stashNonEmpty');
  });
});

describe('1036 粘贴动线（挂载）', () => {
  it('复制叶子后：BoolGroupNode 分区粘贴 → emit 节点含同构子树（id 全新）', async () => {
    const { createApp, h } = await import('vue');
    const BoolGroupNode = (await import('../components/builder/BoolGroupNode.vue')).default;
    copySubtreeToStash(LEAF as any);
    const node: any = { id: 'b0', type: 'bool', children: [], params: {}, arrForm: {} };
    let last: any = null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const nodeRef = (await import('vue')).ref(node);
    const app = createApp({ render: () => h(BoolGroupNode as any, {
      node: nodeRef.value, fields: ['order_no'], types: { order_no: 'keyword' },
      'onUpdate:node': (n: any) => { nodeRef.value = n; last = n; },
      onRemove: () => {}, onWrap: () => {}, onDuplicate: () => {},
    }) });
    app.mount(host);
    await new Promise(r => setTimeout(r, 30));
    // 分区头粘贴钮在场（stash 非空）
    const paste = host.querySelector('button[title*="粘贴子树"]') as HTMLButtonElement;
    expect(paste, '粘贴钮在场（stash 非空）').toBeTruthy();
    paste.click();
    await new Promise(r => setTimeout(r, 30));
    expect(last, '应发 update:node').toBeTruthy();
    expect(last.children.length).toBe(1);
    const pasted = last.children[0];
    expect(pasted.occur).toBe('must');
    expect(pasted.node.op).toBe('term');
    expect(pasted.node.field).toBe('order_no');
    expect(pasted.node.value).toBe('A1');
    expect(pasted.node.id, '全新 id').not.toBe('n1');
    app.unmount();
    host.remove();
  });
  it('空暂存：粘贴钮不显形', async () => {
    const { createApp, h } = await import('vue');
    const BoolGroupNode = (await import('../components/builder/BoolGroupNode.vue')).default;
    subtreeStash.value = null;
    const node: any = { id: 'b0', type: 'bool', children: [], params: {}, arrForm: {} };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(BoolGroupNode as any, {
      node, fields: [], types: {},
      'onUpdate:node': () => {}, onRemove: () => {}, onWrap: () => {}, onDuplicate: () => {},
    }) });
    app.mount(host);
    await new Promise(r => setTimeout(r, 30));
    expect(host.querySelector('button[title*="粘贴子树"]'), '空暂存无粘贴钮').toBeNull();
    app.unmount();
    host.remove();
  });
});
