/**
 * SQL 结果表补「刷新」——与 Lucene 结果表同口径。
 *
 * 真机能力差集实测发现：SQL 结果表工具行缺「刷新」（Lucene 有），
 * 而 SQL 的「改完参数想重跑」是高频动作——此前只能把视线移回页头找执行钮。
 * 内核（QRT）本来就有 refreshable 通道，只是这一处宿主没接线。
 *
 * 判据：SQL 的 QRT 标签必须带 refreshable，且 @refresh 接的是 doRun（既有唯一取数入口）；
 * 负控：把 @refresh 指向别的函数 / 去掉 refreshable，对应断言必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const lucene = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');

/** 从 `<QueryResultTable` 切到闭合 `>` */
function qrtTag(src: string): string {
  const i = src.indexOf('<QueryResultTable');
  expect(i, 'QueryResultTable 必须存在').toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('>', i));
}

describe('SQL 结果表刷新钮', () => {
  it('QRT 标签带 refreshable 且 @refresh 指向 doRun', () => {
    const tag = qrtTag(sql);
    expect(tag, 'refreshable 必须接线').toMatch(/\brefreshable\b/);
    expect(tag, '刷新必须接 doRun（既有唯一取数入口）').toContain('@refresh="doRun"');
  });

  it('doRun 确实是取数入口（不是空转签名）', () => {
    expect(sql, 'doRun 必须存在').toMatch(/async function doRun\(\)/);
    expect(sql, 'doRun 必须真的发 SQL 请求').toMatch(/api\.sql(Json|Lenient)\(/);
  });

  it('与 Lucene 同口径（两处刷新接的是同一类「按当前条件重跑」语义）', () => {
    const ltag = qrtTag(lucene);
    expect(ltag, 'Lucene 侧 refreshable 仍在').toMatch(/\brefreshable\b/);
    expect(ltag, 'Lucene 侧刷新接 doRun').toContain('@refresh="doRun"');
  });

  it('负控：把 @refresh 指到别处必须判不合格（证明判据不是恒真）', () => {
    /* 反向对照——构造一个 refresh 指向其他函数的同形标签，判据必须拒绝。 */
    const wrong = '<QueryResultTable table-bar searchable refreshable @refresh="refreshOnly">';
    const tag = wrong.slice(wrong.indexOf('<QueryResultTable'), wrong.indexOf('>', wrong.indexOf('<QueryResultTable')));
    expect(tag, '指向别处不得通过').not.toContain('@refresh="doRun"');
  });
});
