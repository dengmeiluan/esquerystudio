import { describe, it, expect } from 'vitest';
import { lintSql } from '../utils/sqlLint';

/* 1391：lint 命中多条时按**文档序**输出。

 各规则是独立扫描、结果按规则追加，所以天然是「规则序」：⑥ 裸索引名（第1行）
 → ⑦ GROUP BY 的 text（第3行） → ⑧ LIKE 的 text（第2行）。
 真机实测（1440×900）就是 第1行 / 第3行 / 第2行 这个排法——提示条高 103px，
 用户从上往下读，反而先看到后面那条、再回头看前面那条。

 判据：输出按 line 单调不减；同行内保持规则序（稳定排序，不改语义）。 */
const TYPES = {
  issuer_name: 'text',
  title: 'text', 'title.keyword': 'keyword',
};

const LINT_SQL = `SELECT issuer_name, COUNT(*) FROM logs-2026
WHERE issuer_name LIKE '%a%'
GROUP BY issuer_name
ORDER BY issuer_name`;

describe('1391 lint 输出按行号排序', () => {
  it('三条不同行的命中 → 行号单调不减（不再出现 1/3/2）', () => {
    const r = lintSql(LINT_SQL, ['logs-2026'], TYPES);
    expect(r.length).toBeGreaterThanOrEqual(3);
    const lines = r.map(f => f.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    /* 行号序列本身：第1行（裸索引名）→ 第2行（LIKE）→ 第3行（GROUP BY）→ 第4行（ORDER BY，同字段已去重） */
    expect(lines[0]).toBe(1);
    expect(lines).toContain(2);
    expect(lines).toContain(3);
  });

  it('负控：不排序时同一输入会给出非单调序列（证明这条断言真的在守排序）', () => {
    /* 复刻「按规则追加」的原始顺序：先裸索引名，再 GROUP BY 的 text，再 LIKE 的 text */
    const unsorted = [
      { line: 1, message: 'index' },
      { line: 3, message: 'groupby' },
      { line: 2, message: 'like' },
    ];
    const monotone = unsorted.every((f, i) => i === 0 || f.line >= unsorted[i - 1]!.line);
    expect(monotone, '原始顺序必须是乱的，否则本用例没有守住任何东西').toBe(false);
    const sorted = lintSql(LINT_SQL, ['logs-2026'], TYPES).map(f => f.line);
    expect(sorted.every((l, i) => i === 0 || l >= sorted[i - 1]!)).toBe(true);
  });

  it('同行内的多条保持规则序（稳定排序，不重排同行的语义）', () => {
    /* 同一行既有裸索引名又有 LIKE 命中：两个都在第 1 行，顺序应为「规则⑥ 在前」 */
    const one = 'SELECT * FROM logs.2026 WHERE issuer_name LIKE \'%a%\'';
    const r = lintSql(one, ['logs.2026'], TYPES);
    const atLine1 = r.filter(f => f.line === 1);
    expect(atLine1.length).toBe(2);
    expect(atLine1[0]!.message).toContain('必须加双引号');
    expect(atLine1[1]!.message).toContain('LIKE');
  });
});
