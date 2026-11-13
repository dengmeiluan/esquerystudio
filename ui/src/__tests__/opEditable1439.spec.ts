/**
 * 1439 续：每个算子进树后必须**可编辑**——渲染出字段选择器/主值输入/专用编辑位，
 * 而不是退化成「看不懂的 raw 文本」。
 *
 * 为什么单文本往返（1181/1439 变体表）不够：未识别形态也会 raw 原样写回，
 * 文本相等但界面上没有控件可改，用户面对的是「这段我看得见、改不动」。
 * 这里挂载真实的 ClauseNode，逐算子断言渲染出的可交互控件。
 *
 * 判据按算子的语义形态分档，每档都要求**存在可输入控件**：
 *  · 单字段算子 → 字段槽（FieldSelect 的输入）+ 主值输入（cn-val）
 *  · 多字段算子 → 字段列表输入（cn-fields）+ 主值输入
 *  · 无字段算子（ids/script/…） → 主值输入
 *  · 复合容器（bool/nested/…）不是叶子，不在本表范围内（由树层负责）
 */
import { describe, it, expect } from 'vitest';
import { createApp, h, ref, nextTick, type App } from 'vue';
import ClauseNode from '../components/builder/ClauseNode.vue';
import { QUERY_SNIPPETS } from '../utils/dslCompletionContext';
import { OPS_META, MULTI_LABELS } from '../utils/queryAstOps';
import { parseQueryNode, type LeafNode } from '../utils/queryAst';

const MULTI_OPS = new Set(Object.keys(MULTI_LABELS));

function bodyOf(op: string): any {
  return JSON.parse('{' + QUERY_SNIPPETS[op].replace(/\$\{[^}]*\}/g, '0') + '}');
}

async function settle(n = 5) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const FIELDS = ['title', 'status', 'price', 'loc', 'comments.text', 'v', 'g'];
const TYPES: Record<string, string> = {
  title: 'text', status: 'keyword', price: 'long', loc: 'geo_point',
  'comments.text': 'text', v: 'dense_vector', g: 'keyword',
};

function mountLeaf(node: LeafNode): { el: HTMLElement; app: App } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const n = ref(node);
  const app = createApp({
    render: () => h(ClauseNode, {
      node: n.value, fields: FIELDS, types: TYPES,
      'onUpdate:node': (v: LeafNode) => { n.value = v; },
    }),
  });
  app.mount(host);
  return { el: host, app };
}

/** 该算子是否应出现字段槽（单字段 field 形态或 named 形态） */
function needsFieldSlot(op: string): boolean {
  const form = OPS_META[op]?.form;
  return form === 'field' || form === 'named';
}

/* 无主值的算子：它们的语义里本来就没有「值」可填（exists 只认字段；
   match_all/match_none 什么都不认）。对这三类，字段槽（或算子选择器）就是全部界面。 */
const VALUELESS_OPS = new Set(['exists', 'match_all', 'match_none']);

describe('1439 每个算子进树后都可编辑', () => {
  it('叶子算子渲染出可输入控件（字段槽/主值/专用编辑位至少其一）', async () => {
    const ops = Object.keys(QUERY_SNIPPETS).filter(op => {
      const node = parseQueryNode(bodyOf(op));
      return node && node.type === 'leaf';
    });
    expect(ops.length, '骨架表里叶子算子数不应为空').toBeGreaterThan(20);

    const bad: string[] = [];
    for (const op of ops) {
      let node: any;
      try { node = parseQueryNode(bodyOf(op)); } catch (e: any) { bad.push(`${op}：解析抛错 ${e?.message}`); continue; }
      if (!node || node.type !== 'leaf') { bad.push(`${op}：骨架未解析成叶子`); continue; }
      const { el, app } = mountLeaf(node as LeafNode);
      await settle();
      /* 可交互控件全集中：字段槽输入、主值输入、字段列表、专用编辑位的输入/文本域 */
      const inputs = [...el.querySelectorAll('input, textarea, select')]
        .filter(e => !(e as HTMLInputElement).disabled);
      const hasFieldSlot = !!el.querySelector('.cn-fld input, .cn-fld, input[placeholder*="字段"]');
      const hasValueSlot = !!el.querySelector('.cn-val, .cn-fields, .cn-objval input, .cn-objval textarea');
      const hasOpPicker = !!el.querySelector('.cn-op select, .cn-op');
      const total = inputs.length;
      app.unmount(); el.remove();

      if (!hasOpPicker) bad.push(`${op}：没有算子选择器`);
      if (needsFieldSlot(op) && !hasFieldSlot) bad.push(`${op}：应有字段槽却没有`);
      if (!VALUELESS_OPS.has(op) && !hasValueSlot) bad.push(`${op}：没有主值/专用编辑位`);
      if (total === 0) bad.push(`${op}：整行零个可输入控件`);
    }
    expect(bad, '不可编辑的算子：\n' + bad.join('\n')).toEqual([]);
  });

  it('多字段算子渲染出字段列表输入（而非单字段槽）', async () => {
    const bad: string[] = [];
    for (const op of Object.keys(MULTI_LABELS)) {
      const node = parseQueryNode(bodyOf(op));
      if (!node || node.type !== 'leaf') continue;
      const { el, app } = mountLeaf(node as LeafNode);
      await settle();
      const hasFieldsList = !!el.querySelector('.cn-fields');
      app.unmount(); el.remove();
      if (!hasFieldsList) bad.push(`${op}：多字段算子没有字段列表输入`);
    }
    expect(bad, '多字段算子问题：\n' + bad.join('\n')).toEqual([]);
  });
});
