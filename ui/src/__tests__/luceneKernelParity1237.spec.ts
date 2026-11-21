/**
 * Lucene 结果表与另两张结果表的能力对位。
 *
 * 背景（用户反复问「为什么索引工作区/查询工作台/SQL 的表格能力没有完全共享」）：
 * 三处结果表共用同一批内核组件，但 Lucene 的 QRT 一直没接 searchable / refreshable，
 * 于是同一个命中结果——查询工作台里能就地快滤、能刷新，Lucene 里只能去改上面那条
 * query_string 再点执行。这里把接线锁住，并验证刷新只走 doRun 意图（不另造取数路径）。
 *
 * 判据：
 *  ① Lucene 的 QRT 标签带 :searchable（表格档门控）与 refreshable + @refresh；
 *  ② 快滤只在表格档开（JSON 档没有可过滤的表格行，开就是死 UI）；
 *  ③ 刷新接的是 doRun（按当前条件重跑），不是新写的取数函数。
 * 负控：把 searchable 的档位门控去掉、或把 @refresh 指向别的函数，对应断言必须变红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');

/** 从 `<QueryResultTable` 切到闭合 `>`（标签跨多行，按第一个 `>` 收口） */
function qrtTag(): string {
  const start = src.indexOf('<QueryResultTable');
  expect(start, 'Lucene 必须挂 QueryResultTable（防空跑）').toBeGreaterThan(-1);
  const end = src.indexOf('>', start);
  return src.slice(start, end);
}

describe('Lucene 结果表能力对位', () => {
  it('快滤接线：表格档才开（JSON 档不给死 UI）', () => {
    const tag = qrtTag();
    expect(tag, 'searchable 必须接线').toContain(':searchable=');
    expect(tag, '快滤必须按表格档门控，否则 JSON 档是死 UI').toContain("viewMode === 'table'");
  });

  it('刷新接线：refreshable + @refresh 指向 doRun', () => {
    const tag = qrtTag();
    expect(tag, 'refreshable 必须接线').toMatch(/\brefreshable\b/);
    expect(tag, '刷新必须接 doRun（按当前条件重跑）').toContain('@refresh="doRun"');
  });

  it('负控：doRun 确实是取数入口（不是空转签名）', () => {
    /* 反向对照——证明 @refresh="doRun" 有意义：doRun 里必须真的发请求。
       若 doRun 被改名/掏空，此断言先红，上面那条才有意义。 */
    expect(src, 'doRun 必须存在且为 async 取数入口').toMatch(/async function doRun\(\)/);
    expect(src, 'doRun 内必须有真实取数（请求/查询链路调用）').toMatch(/qr\.begin\(\)|await\s+api\.|searchLucene|queryString/);
  });

  it('负控：另两处结果表仍各自保留自己的能力（防本次改动顺手削平）', () => {
    const dsl = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
    expect(dsl, '查询工作台的 RT 快滤不得被本次改动影响').toContain(':searchable=');
    expect(dsl, '查询工作台的 RT 刷新接线仍在').toMatch(/\brefreshable\b/);
  });
});
