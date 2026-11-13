/**
 * 1207：SQL 补全的「限定列位」把已敲前缀丢了。
 *
 * 现场：SQL 里输入 `t.pub`，候选按类型分档之后**只按字母序**排——
 * publish_date 和 publisher.org_name 并列，真正想找的 publish_time 沉在中间。
 * 根因不是排序算法缺失：`searchFields` 早就带「rank 档 + 路径段感知档」
 * （1170 为构建器字段选择器加的：输入 code 时 bond_code 优先于 encode_flag）。
 * 是 SQL 补全这一支把 `query` 写死成空串，`kw` 为空 → rankOf 与 segRank 恒 0，整套分档失效。
 * 同文件 ① FROM 表名位传的正是 `fromM[1]`，两处口径本来就不一致。
 *
 * 锁：① 源码：限定列位必须把点后前缀传给 searchFields（不得再写死 ''）；
 *     ② 内核口径：同一字段集 + 同一前缀时 searchFields 的分档结果（**不冒充接线证据**，
 *        负控实测：接线改回 '' 后这条仍绿，因为它直接调内核）；
 *     ③ 空前缀不引入噪声；
 *     ④ 段感知（1170）在带前缀时仍按「首段=1 < 尾段=2 < 子串」分档。
 *
 * 浏览器实测（本批）：`SELECT t.pub …` 触发补全后候选只剩 3 项
 * （title / title.keyword / publish_time）——`publisher.org_name` 因为**不以 pub 开头**
 * 被 Monaco 自身的前缀匹配滤掉，这正是"传前缀"带来的收窄（旧实现会列全量 50 项）。
 * 注意 title 排在 publish_time 之前是 Monaco 的匹配序，不是我们的 sortText——不要据此改分档。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { searchFields } from '../utils/fieldSearch';

const src = readFileSync(join(__dirname, '../utils/sqlCompletion.ts'), 'utf-8');

const FIELDS = [
  { path: 'publish_date', type: 'date' },
  { path: 'publisher.org_name', type: 'keyword' },
  { path: 'publish_time', type: 'date' },
  { path: 'pub_code', type: 'keyword' },
  { path: 'title', type: 'text' },
  { path: 'encode_flag', type: 'boolean' },
];
const paths = (q: string) => searchFields({ fields: FIELDS as any, query: q, cap: 50 }).flat.map(h => h.path);

describe('1207 SQL 限定列位的前缀排序', () => {
  it('源码：限定列位把点后前缀传给 searchFields（不再写死空串）', () => {
    const i = src.indexOf('const colM = before.match');
    expect(i, '限定列位分支必须在').toBeGreaterThan(0);
    const seg = src.slice(i, i + 900);
    expect(seg, '必须取点后的前缀').toMatch(/colM\[2\]/);
    expect(seg, '必须把前缀交给 searchFields').toMatch(/query:\s*colPrefix/);
    expect(seg, '不得再写死空 query').not.toMatch(/query:\s*''\s*,\s*cap:\s*50/);
  });

  it('行为（带前缀时排序变化）', () => {
    /* ⚠这条只证明**内核**在 query='pub' 时的分档结果，**不证明 SQL 补全真的传了这个前缀**——
       负控实测：把接线改回 query:'' 后，这条仍然绿（它直接调 searchFields，绕过了 sqlCompletion）。
       接线由上面那条源码断言保证。保留这条是为了把「加了前缀之后候选会变成什么样」固定住，
       避免将来有人只改内核而不知道 SQL 侧的可观察效果。 */
    const withQ = paths('pub');
    expect(withQ.length, '候选必须还在（Monaco 侧也会按前缀收窄）').toBeGreaterThan(0);
    for (const must of ['publish_date', 'publisher.org_name', 'publish_time', 'pub_code']) {
      expect(withQ, `以 pub 开头的字段不能被过滤掉：${must}`).toContain(must);
    }
    expect(withQ).not.toContain('encode_flag');
    expect(withQ[0]!.toLowerCase().startsWith('pub') || withQ[0]!.toLowerCase().split(/[._]/).some(s => s.startsWith('pub'))).toBe(true);
  });

  it('段感知仍生效：code 前缀下，段命中的两个字段排在不相关字段之前', () => {
    /* 1170 的分档是「首段等于 1 < 尾段等于 2」——所以 code_type（首段）在 bond_code（尾段）前，
       **不是我最初以为的 bond_code 第一**。第一版读错口径，已按实现改正。
       另外 searchFields 的过滤是 `includes`：encode_flag 含子串 en·code，**不会被滤掉**，
       这正是 1170 加 segRank 的原因（它和 bond_code 曾同为 rank 2、靠字母序并列）。
       所以这里锁「段命中排在子串命中之前」，而不是锁"不相关字段消失"。 */
    const f = [
      { path: 'encode_flag', type: 'boolean' },
      { path: 'bond_code', type: 'keyword' },
      { path: 'code_type', type: 'keyword' },
    ];
    const out = searchFields({ fields: f as any, query: 'code', cap: 50 }).flat.map(h => h.path);
    expect(out[0], '首段等于 code 的 code_type 优先（1170 首段档）').toBe('code_type');
    expect(out[1], '尾段等于 code 的 bond_code 次之（1170 尾段档）').toBe('bond_code');
    expect(out.indexOf('encode_flag'), '仅段内子串命中的 encode_flag 必须排最后').toBe(2);
  });

  it('空前缀不引入噪声：查询为空时保留全量字段', () => {
    const out = paths('');
    expect(out.length, '空 query 必须返回全量（cap 内）').toBe(FIELDS.length);
  });
});
