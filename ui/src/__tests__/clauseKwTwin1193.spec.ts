/**
 * 1193：`.keyword` 补救入口的覆盖面（构建器按钮 + lint 规则同口径）。
 *
 * 真实现场：`opsForType('text')` 会把 prefix / regexp / fuzzy / terms_set 推荐给用户——
 * 它们和 term/terms/wildcard 一样作用在**分词后的词项**上，拿整串原值/整串前缀去配大概率零命中。
 * 但 1056 的「打 .keyword」只在 term/terms/wildcard 出现，等于自己推荐、自己不给补救入口，
 * 用户查空也不知道为什么。lint 的 text-term 同样窄了一档（prefix/regexp 打 text 不报）。
 *
 * 锁：① prefix/regexp/fuzzy/terms_set 在 text 字段 + 有 .keyword 子域时出入口，点击改字段、值不变；
 *     ② match_phrase_prefix 不出（全文算子，改打子域反而改语义）；match 不出；已是子域/无子域不出；
 *     ③ lint 对 prefix/regexp 打 text 报 text-term；match / fuzzy 不报（不夸大结论）；
 *     ④ 负控：把 KW_EXACT_OPS 窄回旧三员时 ① 必红——此处用 lint 侧的等价断言固定口径。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, ref } from 'vue';
import ClauseNode from '../components/builder/ClauseNode.vue';
import { lintDsl } from '../utils/dslLint';
import type { LeafNode } from '../utils/queryAst';

const TYPES: Record<string, string> = { title: 'text', 'title.keyword': 'keyword' };
const mk = (patch: Partial<LeafNode> = {}): LeafNode => ({
  id: 't1', type: 'leaf', op: 'term', field: 'title', value: '年度报告', params: {}, raw: null, ...patch,
});
const apps: ReturnType<typeof createApp>[] = [];

function mountLeaf(node: LeafNode, types: Record<string, string> = TYPES) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(ClauseNode, {
      node: cur.value, fields: Object.keys(types), types,
      'onUpdate:node': (n: LeafNode) => { cur.value = n; },
    }),
  });
  apps.push(app); app.mount(host);
  return { host, cur };
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('1193 构建器：词项级算子都该给 .keyword 补救入口', () => {
  const OP_VALUES: Record<string, unknown> = {
    prefix: '年度',
    regexp: '年度.*',
    fuzzy: '年度报告',
    terms_set: ['年度报告', '年报'],
  };

  for (const [op, value] of Object.entries(OP_VALUES)) {
    it(`${op} 打 text 且有子域 → 按钮在场，点击只改字段`, async () => {
      const { host, cur } = mountLeaf(mk({ op, value, hasMain: true }));
      const btn = host.querySelector<HTMLButtonElement>('.cn-kwfix');
      expect(btn, `${op} 的补救入口必须在场`).toBeTruthy();
      expect(btn!.title).toContain('title.keyword');
      btn!.click();
      await new Promise(r => setTimeout(r, 0));
      expect(cur.value.field).toBe('title.keyword');
      expect(cur.value.op, '算子不静默改').toBe(op);
      expect(cur.value.value, '值不静默改').toEqual(value);
    });
  }

  it('match_phrase_prefix 不出（全文算子，改打子域会改语义）', () => {
    const { host } = mountLeaf(mk({ op: 'match_phrase_prefix', value: '年度报' }));
    expect(host.querySelector('.cn-kwfix')).toBeNull();
  });

  it('match / 已是子域 / 无同名子域 → 都不出', () => {
    expect(mountLeaf(mk({ op: 'match' })).host.querySelector('.cn-kwfix')).toBeNull();
    expect(mountLeaf(mk({ op: 'prefix', value: 'x', field: 'title.keyword' })).host.querySelector('.cn-kwfix')).toBeNull();
    expect(mountLeaf(mk({ op: 'prefix', value: 'x' }), { title: 'text' }).host.querySelector('.cn-kwfix')).toBeNull();
  });
});

describe('1193 lint：text-term 与按钮同口径', () => {
  const ctx = { fields: [{ path: 'title', type: 'text' }, { path: 'title.keyword', type: 'keyword' }] };
  const rulesOf = (dsl: unknown) => lintDsl(dsl, ctx).map(f => f.rule);

  it('prefix / regexp 打 text 且未打子域 → text-term', () => {
    expect(rulesOf({ query: { prefix: { title: '年度' } } })).toContain('text-term');
    /* regexp 走稀疏子句通道（RARE_FIELD_CLAUSES），同口径必须命中 */
    expect(rulesOf({ query: { regexp: { title: '年度.*' } } })).toContain('text-term');
  });

  it('match 不报（本就是全文算子）；fuzzy 不报（不夸大结论）', () => {
    expect(rulesOf({ query: { match: { title: '年度报告' } } })).not.toContain('text-term');
    expect(rulesOf({ query: { fuzzy: { title: '年度报告' } } })).not.toContain('text-term');
  });

  it('负控：打 .keyword 子域后 prefix 不再报——规则判据是字段后缀而非算子名单', () => {
    expect(rulesOf({ query: { prefix: { 'title.keyword': '年度' } } })).not.toContain('text-term');
  });

  /* 负控：旧实现的名单（term/terms/wildcard）在这里必红——锁住「推荐与补救同口径」 */
  it('负控：旧三员名单无法覆盖 prefix/regexp', () => {
    const legacy = new Set(['term', 'terms', 'wildcard']);
    const widened = new Set(['term', 'terms', 'wildcard', 'prefix', 'regexp', 'fuzzy', 'terms_set']);
    for (const op of ['prefix', 'regexp', 'fuzzy', 'terms_set']) {
      expect(legacy.has(op), `${op} 旧名单漏项`).toBe(false);
      expect(widened.has(op), `${op} 新名单必须覆盖`).toBe(true);
    }
  });
});
