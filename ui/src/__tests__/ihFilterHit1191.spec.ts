/**
 * 1191：索引工作区的「以此值过滤并重查」是死键（点了没反应）。
 *
 * RT 早就 emit `filter-hit`，DSL 工作台也接（并进 DSL 再跑）；
 * 但 IndexHubView 的 ResultTable 实例只挂了 sort-change/open-doc/…，**没挂 filter-hit**。
 * 于是同一个右键菜单项：在查询工作台能用，在索引工作区点了什么都不发生——
 * 正是用户问的「三个入口能力为什么不一致」里最伤的一类（不是少功能，是假按钮）。
 *
 * 修：索引工作区的查询面是 Lucene 查询词，把条件拼成 `field:"value"` 与既有词 AND 后重查，
 * 与 DSL 侧「条件并入再跑」同一心智；给出回执说明条件已并进检索词（可编辑后再跑）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

describe('1191 索引工作区 filter-hit 接线', () => {
  it('RT 确实 emit 了 filter-hit（前置事实）', () => {
    expect(rt).toContain("(e: 'filter-hit'");
  });

  it('IndexHubView 的 ResultTable 挂了监听', () => {
    expect(ih).toContain('@filter-hit="onDocsFilterHit"');
  });

  it('处理函数：并进 Lucene 词 + 重查 + 回执', () => {
    const seg = ih.slice(ih.indexOf('function onDocsFilterHit'), ih.indexOf('function onDocsFilterHit') + 900);
    expect(seg).toContain('docsQ.value');
    expect(seg, '必须重查，否则只是改了个输入框').toContain('runDocsNew()');
    expect(seg).toContain('store.notify');
    /* 既有词不清空——是 AND 追加。1439 起合并逻辑收进 utils/filterMerge
       （排除分支也在那儿），此处锁「走的是那个共用件」，AND 语义由
       filterMerge1439.spec 的 appendLuceneClause 用例逐字验证。 */
    expect(seg).toContain('appendLuceneClause(');
  });

  it('负控：值里的引号必须转义（否则拼出非法 Lucene）', () => {
    const seg = ih.slice(ih.indexOf('function onDocsFilterHit'), ih.indexOf('function onDocsFilterHit') + 900);
    expect(seg).toMatch(/replace\(\/"\/g/);
  });
});
