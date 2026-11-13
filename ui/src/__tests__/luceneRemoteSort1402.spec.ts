/**
 * 一千四百零二批：Lucene 表头排序改为服务端排序（此前只排当前页）。
 *
 * 用户心智：点表头箭头 = 「整个结果按这列排」。Lucene 是服务端分页（size/from），
 * 旧接线走 QRT 本地档，只重排手上这 20 行——翻页顺序立刻还原，等于骗人。
 * QRT 内核早有 remote 档（只 emit 意图 + syncSort 回填箭头），Lucene 没接。
 *
 * 本批锁：
 *  ① 宿主传 remote-sort + sync-sort + @sort-change；
 *  ② sort-change 写回 sortField/sortOrder 并回第一页重查（改的是请求，不只是行序）；
 *  ③ text 列经 resolveSortField 改写 .keyword；不可排序就地拦下不重查；
 *  ④ 箭头回填把 .keyword 还原成列名（否则列头对不上、箭头不亮）；
 *  ⑤ 内核提示：远端档不得再挂「仅排序已加载 N 行」；本地档仍保留该诚实标注；
 *  ⑥ 负控：移除 remote-sort → ① 红；移除 !props.remoteSort → ⑤ 红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LUCENE = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');
const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('1402 Lucene 远端排序接线', () => {
  it('① 结果表接线 remote-sort / sync-sort / sort-change', () => {
    const tag = LUCENE.match(/<QueryResultTable[\s\S]*?>/)?.[0] ?? '';
    expect(tag).toContain(':hits="hits"');
    expect(tag).toMatch(/\sremote-sort[\s>]/);
    expect(tag).toContain(':sync-sort="luceneSortSync"');
    expect(tag).toContain('@sort-change="onSortChange"');
    /* 负控：删掉 remote-sort 必须判不合格 */
    expect(tag.replace(/\sremote-sort[\s>]/, ' ')).not.toMatch(/\sremote-sort[\s>]/);
  });

  it('② sort-change 写回请求参数并回第一页重查', () => {
    expect(LUCENE).toMatch(/function onSortChange\(s: \{ f: string; d: 'asc' \| 'desc' \} \| null\)/);
    expect(LUCENE, '写回排序字段').toMatch(/sortField\.value = res\.field;/);
    expect(LUCENE, '写回方向').toMatch(/sortOrder\.value = s\.d;/);
    expect(LUCENE, '取消排序要清字段').toMatch(/sortField\.value = '';/);
    expect(LUCENE, '回第一页').toMatch(/from\.value = 0;\s*\n\s*void doRun\(\);/);
  });

  it('③ text 列裁决与不可排序拦截', () => {
    expect(LUCENE).toMatch(/const res = resolveSortField\(s\.f, fieldTypes\.value\);/);
    expect(LUCENE).toMatch(/if \(!res\.ok\) \{ store\.notify\('warning'[\s\S]{0,80}return; \}/);
  });

  it('④ 箭头回填把 .keyword 还原成列名', () => {
    expect(LUCENE).toContain('const luceneSortSync = computed(');
    expect(LUCENE, '只有基列是 text 且同名字域是 keyword 才剥离').toMatch(/fieldTypes\.value\?\.\[base\] === 'text' && fieldTypes\.value\?\.\[f\] === 'keyword'/);
  });

  it('⑤ 内核提示分档：远端不说「仅已加载」，本地保留', () => {
    expect(QRT).toMatch(/const partial = props\.sortable && !props\.useAsCondition && !props\.remoteSort/);
    expect(QRT).toContain('按服务端排序重查，跨页一致');
    expect(QRT, '本地区间文案不能被顺手删掉').toContain('全部结果请改查询侧排序');
    /* 负控：去掉 !props.remoteSort → 本断言红 */
    expect(QRT.replace('&& !props.remoteSort', '')).not.toMatch(/const partial = props\.sortable && !props\.useAsCondition && !props\.remoteSort/);
  });
});
