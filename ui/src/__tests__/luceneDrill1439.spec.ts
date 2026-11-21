/**
 * 1439：Lucene 结果表的下钻（加入查询条件 / 排除此值）。
 *
 * 此前 QRT 的 use-as-condition 被 `!isHits` 挡住，Lucene（hits 型）只能「仅筛选当前结果」，
 * 想按某个值精炼查询只能手改检索词；而 SQL / 索引工作区都能从结果下钻。
 *
 * 判据：
 * ① QRT 不再按 hits 关闭下钻（宿主传 prop 才出现，未接宿主零增量）
 * ② 文案随 condTarget（SQL 宿主渲染仍是「改 SQL」）
 * ③ Lucene 宿主接线，并复用 appendLuceneClause 合并（不另造拼接）
 * 负控：抹掉 cond-target → ③ 必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf8');
const LUCENE = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf8');

function problems(qrt: string, lucene: string): string[] {
  const out: string[] = [];
  /* ① 下钻门里不得再有 !isHits */
  if (/useAsCondition\s*&&\s*!isHits\.value/.test(qrt)) out.push('QRT 仍按 hits 型关闭下钻');
  if (!qrt.includes('props.useAsCondition && col && /^[A-Za-z_][\\w.]*$/.test(col)')) out.push('QRT 下钻门形状变了（未识别）');
  /* ② 文案参数化 + 缺省 SQL */
  if (!qrt.includes('改 ${props.condTarget}')) out.push('菜单文案未随 condTarget');
  if (!qrt.includes("condTarget: 'SQL'")) out.push('condTarget 缺省不是 SQL');
  /* ③ Lucene 接线 */
  if (!lucene.includes('use-as-condition')) out.push('Lucene 表未开 use-as-condition');
  if (!lucene.includes('cond-target="Lucene"')) out.push('Lucene 未声明 cond-target');
  if (!lucene.includes(':cond-sort="false"')) out.push('Lucene 未关掉 sort-by 两项（它没接 sort-by）');
  if (!lucene.includes('@use-as-condition="useAsCondition"')) out.push('Lucene 未接事件');
  if (!/function useAsCondition\(/.test(lucene)) out.push('Lucene 缺处理函数');
  if (!lucene.includes('appendLuceneClause(')) out.push('Lucene 未复用共用合并件');
  return out;
}

describe('1439 Lucene 结果下钻', () => {
  it('三项接线齐全', () => {
    expect(problems(QRT, LUCENE)).toEqual([]);
  });

  it('负控：删掉 cond-target → 判据必须点名', () => {
    const broken = LUCENE.replace('cond-target="Lucene"', '');
    expect(broken).not.toBe(LUCENE);
    expect(problems(QRT, broken)).not.toEqual([]);
  });

  it('负控：恢复 !isHits 门 → 判据必须点名', () => {
    const broken = QRT.replace(
      'props.useAsCondition && col && /^[A-Za-z_][\\w.]*$/.test(col)',
      'props.useAsCondition && !isHits.value && col && /^[A-Za-z_][\\w.]*$/.test(col)',
    );
    expect(broken).not.toBe(QRT);
    expect(problems(broken, LUCENE)).not.toEqual([]);
  });
});
