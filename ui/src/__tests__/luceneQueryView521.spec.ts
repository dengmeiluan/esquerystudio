/**
 * 五百二十一批：LuceneQueryView 三项合并静态契约。
 *  ① JSON 视图过滤态命中行标记——_id 套 MarkText（mt-mark 高亮）+ 命中行底色类 + aria-current；
 *  ② 页大小自管 legacy 键合并 composables/usePagerSize（读钳制+共享写），lucene 起档 50 语义保留；
 *  ③ took 纯数值 stats item → TookBadge 四档语义徽标（BulkEditorView 同款），shards 留 MetaStrip 值对。
 * 静态守卫范式（同 luceneJsonFind374/lucenePager302）：Monaco/QueryResultTable 挂载链在 happy-dom
 * 不可行，源码契约锁定。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');

describe('Lucene JSON 视图命中行标记（521 批）', () => {
  it('_id 套 MarkText，kw=过滤词 trim', () => {
    expect(v).toContain('<MarkText :text="h._id" :kw="jsonMarkKw" />');
    expect(v).toMatch(/import MarkText from '\.\.\/components\/MarkText\.vue';/);
    expect(v).toMatch(/const jsonMarkKw = computed\(\(\) => jsonKw\.value\.trim\(\)\);/);
  });

  it('命中行底色类 + aria-current（kw 空时无类无属性零扰动）', () => {
    expect(v).toContain(`:class="{ 'lc-hit-row': !!jsonMarkKw }"`);
    expect(v).toContain(`:aria-current="jsonMarkKw ? 'true' : undefined"`);
    expect(v).toMatch(/\.lc-hit-row td \{ background: var\(--ac-soft\); \}/);
  });
});

describe('Lucene 页大小合并 usePagerSize（521 批，遗留清零二批参数化同步更新）', () => {
  it('合并共享件：读钳制+共享写，不再本地直写 es_pager_size', () => {
    expect(v).toMatch(/import \{ usePagerSize, PAGER_SIZES \} from '\.\.\/composables\/usePagerSize';/);
    expect(v).toMatch(/const \{ size, set: setSharedSize \} = usePagerSize\(\{ legacyKey: 'lucene\.size', def: 50 \}\);/);
    expect(v).toMatch(/function setSize\(v: number\) \{\n {2}setSharedSize\(v\);/);
    expect(v).not.toMatch(/localStorage\.setItem\('es_pager_size'/);
  });

  it('lucene 起档 50 语义保留：legacyKey=lucene.size+def=50 参数合并，裸 localStorage 种子退役', () => {
    expect(v).toMatch(/usePagerSize\(\{ legacyKey: 'lucene\.size', def: 50 \}\)/);
    expect(v, '读回落链收口 usePagerSize（共享键→legacyKey→def）').not.toMatch(/localStorage\.getItem\('lucene\.size'\)/);
    expect(v).not.toMatch(/localStorage\.getItem\('es_pager_size'\)/);
  });

  it('翻页/分页语义不回归（302 批契约同步更新）', () => {
    expect(v).toMatch(/from\.value = \(p - 1\) \* size\.value/);
    expect(v).toMatch(/const totalPages = computed\(\(\) => Math\.max\(1, Math\.ceil\(total\.value \/ Math\.max\(1, size\.value\)\)\)\)/);
  });
});

describe('Lucene took → TookBadge（521 批）', () => {
  it('took 挂 TookBadge 四档语义徽标；纯数值 stats item 退役', () => {
    expect(v).toMatch(/import TookBadge from '\.\.\/components\/TookBadge\.vue';/);
    expect(v).toContain('<MetaStrip class="lc-meta" :items="metaItems"><TookBadge :ms="took" /></MetaStrip>');
    expect(v).not.toMatch(/value: took\.value/);
    expect(v).toMatch(/label: 'shards'/);
  });
});
