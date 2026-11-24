/**
 * 五百二十八批：dslLint 20→25 五条新规则逐条契约 + esEnumZh 四导出接线看守。
 *  ① root-bare-clause（error）：子句键裸在根层未包 query——ES 对根级未知键直接 400；
 *  ② collapse-structure（error）：collapse 值须 {字段} 对象形态，标量串/数组报错；
 *  ③ sort-order-typo（warning）：排序方向白名单 asc/desc（对象 order 值与简写串值两形态），
 *     range-op-typo 同型编辑距离机制；
 *  ④ highlight-fields（warning）：缺 fields / fields 写标量串（multi-match-fields 双分支同型）；
 *  ⑤ script-inline（warning）：script 旧键 "inline"（6.x 起改名 "source"）。
 * 五条全部零 ctx 依赖（不传 mapping 字段表照常工作）。
 * 另锁 esEnumZh jobStatusZh/snapshotStateZh/phaseZh/indexStatusZh 的四页消费接线
 * （源码级防回潮，esEnumZh.spec ③ 段同手法）。
 * 纯函数 + 源码读断言，无挂载。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintDsl } from '../dslLint';
import { jobStatusZh, snapshotStateZh, phaseZh, indexStatusZh } from '../esEnumZh';

const rules = (o: unknown, ctx?: Parameters<typeof lintDsl>[1]) => lintDsl(o, ctx).map(f => f.rule);

describe('五百二十八批规则①：root-bare-clause（根层裸子句，error 档）', () => {
  it('term 裸在根层 → error，path/anchor=子句键', () => {
    const fs = lintDsl({ term: { status: 'ACTIVE' } });
    const f = fs.find(x => x.rule === 'root-bare-clause');
    expect(f, '应产出 root-bare-clause finding').toBeTruthy();
    expect(f!.severity).toBe('error');
    expect(f!.path).toBe('term');
    expect(f!.anchor).toBe('term');
    expect(f!.message).toContain('query');
  });

  it('terms/range/wildcard 等子句键逐键各一条', () => {
    const fs = lintDsl({ terms: { status: ['A'] }, range: { age: { gte: 1 } } });
    const bare = fs.filter(x => x.rule === 'root-bare-clause');
    expect(bare.length).toBe(2);
    expect(bare.map(x => x.anchor).sort()).toEqual(['range', 'terms']);
  });

  it('包在 query 里不报；根层无子句键不报', () => {
    expect(rules({ query: { term: { status: 'A' } } })).not.toContain('root-bare-clause');
    expect(rules({ query: { match_all: {} }, size: 10 })).not.toContain('root-bare-clause');
  });
});

describe('五百二十八批规则②：collapse-structure（collapse 结构错，error 档）', () => {
  it('collapse 写标量串 → error', () => {
    const fs = lintDsl({ query: { match_all: {} }, collapse: 'user_id' });
    const f = fs.find(x => x.rule === 'collapse-structure');
    expect(f, '应产出 collapse-structure finding').toBeTruthy();
    expect(f!.severity).toBe('error');
    expect(f!.anchor).toBe('collapse');
    expect(f!.message).toContain('user_id');
  });

  it('collapse 写数组同样报（非对象形态）', () => {
    expect(rules({ collapse: ['user_id'] })).toContain('collapse-structure');
  });

  it('对象形态 { "user_id": {} } 合法不报', () => {
    expect(rules({ collapse: { user_id: {} } })).not.toContain('collapse-structure');
  });
});

describe('五百二十八批规则③：sort-order-typo（排序方向拼写，warning 档）', () => {
  it('对象形态 order:"ascending" → warning，suggestion 带最近合法值 asc', () => {
    const fs = lintDsl({ sort: [{ created: { order: 'ascending' } }] });
    const f = fs.find(x => x.rule === 'sort-order-typo');
    expect(f, '应产出 sort-order-typo finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.anchor).toBe('created');
    expect(f!.suggestion).toContain('"asc"');
  });

  it('简写形态 {"f":"descend"} 同样报', () => {
    const fs = lintDsl({ sort: [{ created: 'descend' }] });
    const f = fs.find(x => x.rule === 'sort-order-typo');
    expect(f).toBeTruthy();
    expect(f!.message).toContain('descend');
  });

  it('asc/desc 白名单放行（两形态都不报）', () => {
    expect(rules({ sort: [{ created: { order: 'desc' } }] })).not.toContain('sort-order-typo');
    expect(rules({ sort: ['_doc'] })).not.toContain('sort-order-typo');
    expect(rules({ sort: [{ _score: 'asc' }] })).not.toContain('sort-order-typo');
  });

  it('与 sort-unknown-field/text-sort 独立共存（无 ctx 也出 sort-order-typo）', () => {
    const rs = rules({ sort: [{ nofield: { order: 'sideways' } }] });
    expect(rs).toContain('sort-order-typo');
    expect(rs).not.toContain('sort-unknown-field');
  });
});

describe('五百二十八批规则④：highlight-fields（缺 fields / 标量串，warning 档）', () => {
  it('highlight 缺 fields → warning', () => {
    const fs = lintDsl({ query: { match_all: {} }, highlight: { pre_tags: ['<em>'] } });
    const f = fs.find(x => x.rule === 'highlight-fields');
    expect(f, '应产出 highlight-fields finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.anchor).toBe('highlight');
  });

  it('fields 写标量串 → warning', () => {
    const fs = lintDsl({ highlight: { fields: 'title' } });
    const f = fs.find(x => x.rule === 'highlight-fields');
    expect(f).toBeTruthy();
    expect(f!.path).toBe('highlight.fields');
    expect(f!.message).toContain('title');
  });

  it('fields 对象/数组形态合法不报', () => {
    expect(rules({ highlight: { fields: { title: {} } } })).not.toContain('highlight-fields');
    expect(rules({ highlight: { fields: ['title'] } })).not.toContain('highlight-fields');
  });
});

describe('五百二十八批规则⑤：script-inline（旧键 inline，warning 档）', () => {
  it('script 含 "inline" → warning，anchor=script', () => {
    const fs = lintDsl({ script_fields: { x: { script: { inline: "doc['a'].value", lang: 'painless' } } } });
    const f = fs.find(x => x.rule === 'script-inline');
    expect(f, '应产出 script-inline finding').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.anchor).toBe('script');
    expect(f!.suggestion).toContain('source');
  });

  it('已改名 "source" 不报；script 缺 inline 键（id 形态）不报', () => {
    expect(rules({ script_fields: { x: { script: { source: "doc['a'].value" } } } })).not.toContain('script-inline');
    expect(rules({ script_fields: { x: { script: { id: 'my_script' } } } })).not.toContain('script-inline');
  });
});

describe('五百二十八批：新五规则零 ctx 安全（不传 mapping 字段表照常工作）', () => {
  it('ctx 缺省时五规则全部照常出（lintDsl(obj) 单参调用）', () => {
    const rs = rules({
      term: { status: 'A' },
      collapse: 'u',
      sort: [{ c: { order: 'ascending' } }],
      highlight: {},
      script_fields: { x: { script: { inline: '1' } } },
    });
    expect(rs).toContain('root-bare-clause');
    expect(rs).toContain('collapse-structure');
    expect(rs).toContain('sort-order-typo');
    expect(rs).toContain('highlight-fields');
    expect(rs).toContain('script-inline');
  });
});

describe('五百二十八批：esEnumZh 四导出纯函数口径（接线数据源）', () => {
  it('jobStatusZh：已知枚举中文、未知/空回落空串', () => {
    expect(jobStatusZh('RUNNING')).toBe('运行中');
    expect(jobStatusZh('SUCCEEDED')).toBe('已成功');
    expect(jobStatusZh('SOMETHING_NEW')).toBe('');
    expect(jobStatusZh('')).toBe('');
  });

  it('snapshotStateZh：五枚举中文、未知回落空串', () => {
    expect(snapshotStateZh('SUCCESS')).toBe('成功');
    expect(snapshotStateZh('PARTIAL')).toBe('部分成功');
    expect(snapshotStateZh('IN_PROGRESS')).toBe('进行中');
    expect(snapshotStateZh('WHATEVER')).toBe('');
  });

  it('phaseZh：五相位中文、大小写不敏感、未知回落空串', () => {
    expect(phaseZh('hot')).toBe('热');
    expect(phaseZh('FROZEN')).toBe('冻结');
    expect(phaseZh('newphase')).toBe('');
  });

  it('indexStatusZh：open/close 中文、其他回落空串', () => {
    expect(indexStatusZh('open')).toBe('已打开');
    expect(indexStatusZh('close')).toBe('已关闭');
    expect(indexStatusZh('open?x=1')).toBe('');
  });
});

describe('五百二十八批：四页接线看守（源码级防回潮，esEnumZh.spec ③ 段同手法）', () => {
  const read = (p: string) => readFileSync(join(__dirname, '../../views', p), 'utf-8');

  it('AdhocRebuildView：jobStatusZh import + 执行监控状态插值接线（条件行不动）', () => {
    const src = read('AdhocRebuildView.vue');
    /* 独立 import 行：既有 sevPill import 行被 esEnumZh.spec/w10ReduceSteps525 逐字锁，一字不动 */
    expect(src).toMatch(/import \{ jobStatusZh \} from '\.\.\/utils\/esEnumZh'/);
    expect(src).toContain('jobStatusZh(job.status)');
    /* permGating 锁形不受扰：状态条件行一字未动 */
    expect(src).toContain("v-if=\"canMutateJob && job?.status === 'RUNNING'\""); /* 1007：中止仅创建者/ADMIN */
  });

  it('OverviewView：最近作业状态插值接 jobStatusZh（中文+英文小字）', () => {
    const src = read('OverviewView.vue');
    /* 六百三十四批随迁（判例 634-C5）：G14 健康词汇四处接线使本文件 esEnumZh import 合并为
       「jobStatusZh, clusterHealthZh」——接线事实不变（仍须由 esEnumZh 引入），字面随迁保判别力 */
    expect(src).toMatch(/import \{ jobStatusZh, clusterHealthZh \} from '\.\.\/utils\/esEnumZh'/);
    expect(src).toContain('jobStatusZh(j.status)');
    /* 五百三十一批：徽标换装 StatusPill 统一件——en 英文小字档组件化（.sp-en 随组件），
       本地 ov-st-en 类退役；dot-pulse 呼吸点保留本地（组件无插槽不硬塞，记档） */
    expect(src).toContain('<StatusPill :tone="jobTone(j.status)" :label="jobStatusZh(j.status) || j.status || \'-\'" :en="jobStatusZh(j.status) ? j.status : undefined" />');
    expect(src).not.toContain('class="ov-st-en"');
  });

  it('SnapshotsView：主列表与恢复向导两处 state 插值接 snapshotStateZh（chip 档不动）', () => {
    const src = read('SnapshotsView.vue');
    expect(src).toMatch(/import \{ snapshotStateZh \} from '\.\.\/utils\/esEnumZh'/);
    expect(src).toContain('snapshotStateZh(s.state)');
    expect(src).toContain('snapshotStateZh(restoreTarget.state)');
    /* snapshotsRowMenu 锁形不受扰：state 判定与过滤串一字未动 */
    expect(src).toMatch(/const inProgress = s\.state === 'IN_PROGRESS';/);
  });

  it('IlmView：phase 插值接 phaseZh（色档绑定不动）', () => {
    const src = read('IlmView.vue');
    expect(src).toMatch(/import \{ phaseZh \} from '\.\.\/utils\/esEnumZh'/);
    expect(src).toContain('phaseZh(info.phase)');
    expect(src).toContain('PHASE_COLORS[info.phase]');
  });
});
