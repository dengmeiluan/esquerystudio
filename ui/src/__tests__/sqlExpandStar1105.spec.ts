import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expandStarColumns } from '../utils/sqlStar';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1105：SELECT * 一键展开字段（按当前 mapping，子域去重、上限 60、不伪造字段）。
 * 生产大文档 SELECT * 返回面过宽；展开后 payload 更小、列语义更清楚。
 *
 * 1387 改写：原断言只锁源码字面（`const pool = all.filter(...)`），换实现即红、
 * 实现有 bug 却是绿的——真机实测 `publisher`（object 容器）被写进 SELECT 时本 spec
 * 全绿。列挑选逻辑已下沉 utils/sqlStar，这里直接跑纯函数断言**产出**，
 * 源码锚只留「接线在不在」两处。 */
const FIELDS = [
  { path: 'amount', type: 'double' },
  { path: 'publisher', type: 'object' },
  { path: 'publisher.org_code', type: 'keyword' },
  { path: 'publisher.org_name', type: 'keyword' },
  { path: 'title', type: 'text' },
  { path: 'title.keyword', type: 'keyword' },
  { path: 'tags', type: 'nested' },
  { path: 'tags.v', type: 'keyword' },
];

describe('1105/1387 SQL SELECT * 展开字段', () => {
  it('容器字段（object/nested）不进列清单——ES SQL 直接选会失败', () => {
    const ex = expandStarColumns(FIELDS, 60);
    expect(ex.cols).not.toContain('"publisher"');
    expect(ex.cols).not.toContain('"tags"');
    /* 叶子照常保留 */
    expect(ex.cols).toContain('"publisher.org_name"');
    expect(ex.cols).toContain('"tags.v"');
    expect(ex.skippedContainers).toBe(2);
  });

  it('去 .keyword 子域、双引号转义、上限截断且计数诚实', () => {
    const ex = expandStarColumns(FIELDS, 60);
    expect(ex.cols).not.toContain('"title.keyword"');
    expect(ex.cols).toContain('"title"');
    /* 池 = amount / publisher.org_code / publisher.org_name / title / tags.v */
    expect(ex.pool).toBe(5);
    expect(ex.picked).toBe(5);

    const capped = expandStarColumns(FIELDS, 2);
    expect(capped.picked).toBe(2);
    expect(capped.pool).toBe(5);

    const quoted = expandStarColumns([{ path: 'a"b', type: 'keyword' }], 60);
    expect(quoted.cols).toBe('"a""b"');
  });

  it('负控：容器不清洗时上面第一条必红（证明判据真的连着产出）', () => {
    const dirty = FIELDS.map(f => ({ ...f }));
    const naive = dirty.map(f => '"' + f.path + '"').join(', ');
    expect(naive).toContain('"publisher"');
    expect(expandStarColumns(dirty, 60).cols).not.toContain('"publisher"');
  });

  it('接线：展开走纯函数，且 FROM 无单一索引时不出按钮、改出可读原因', () => {
    expect(src).toContain("import { expandStarColumns } from '../utils/sqlStar';");
    expect(src).toContain('const ex = expandStarColumns(sqlFieldsCtx.fields.value, STAR_CAP);');
    expect(src).toContain('data-test="sql-expand-star"');
    expect(src).toContain('data-test="sql-expand-star-blocked"');
    /* 字段源必须属于语句自己的 FROM——通配/多表回落顶栏索引会把 A 的列写进查 B 的语句 */
    expect(src).toContain('&& sqlFieldsCtx.fields.value.length > 0 && !!sqlFromIdx.value);');
    expect(src).toContain('const advisoryText = computed(() => editScope.value?.text ?? sql.value);');
    expect(src).toContain('applyScopedEdit(next);');
  });
});
