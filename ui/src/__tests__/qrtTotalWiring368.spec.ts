/**
 * 三百六十八批：QRT total/totalGte 消费真接线——367 批只建了管道（props 声明），
 * 无任何视图通水； Lucene/PIT/模板测试三宿主把已持有的 total refs 传入，
 * 工具行计数「本页行数/全量命中（+ 为下界）」与 RT 计数条同口径。
 * SqlConsole 反向锁：SQL 行集无服务端总数概念，禁止误接（传了会显示假分母）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const qrtSrc = readFileSync(join(SRC, 'components/QueryResultTable.vue'), 'utf-8');
const luceneSrc = readFileSync(join(SRC, 'views/LuceneQueryView.vue'), 'utf-8');
const pitSrc = readFileSync(join(SRC, 'views/PitScrollView.vue'), 'utf-8');
const tplSrc = readFileSync(join(SRC, 'views/SearchTemplatesView.vue'), 'utf-8');
const sqlSrc = readFileSync(join(SRC, 'views/SqlConsoleView.vue'), 'utf-8');

describe('QRT total 接线（368 批）', () => {
  it('QRT：props 声明 + 工具行条件计数（367 批管道在此补锁；525 批同步更新：计数条内嵌 took TookBadge）', () => {
    expect(qrtSrc).toMatch(/total\?: number;/);
    expect(qrtSrc).toMatch(/totalGte\?: boolean;/);
    expect(qrtSrc).toMatch(
      /<span v-if="props\.total != null" class="qrt-coln mono">\{\{ sortedRows\.length \}\}\/\{\{ props\.total \}\}\{\{ props\.totalGte \? '\+' : '' \}\}<template v-if="props\.took != null && props\.took >= 0"> · <TookBadge :ms="props\.took" \/><\/template><\/span>/,
    );
  });

  it('Lucene：本页 hits/全量 total 传入 QRT（totalGte 下界随行）', () => {
    expect(luceneSrc).toMatch(/<QueryResultTable[^>]*:hits="hits" :total="total" :total-gte="totalGte"/);
    expect(luceneSrc).toMatch(/const total = ref\(0\);/);
    expect(luceneSrc).toMatch(/const totalGte = ref\(false\);/);
  });

  it('PIT：预览 100 条/滚动全量 total 传入 QRT（relation=gte 时 + 标注）', () => {
    expect(pitSrc).toMatch(/<QueryResultTable[^>]*:hits="preview" :total="total" :total-gte="totalGte"/);
    expect(pitSrc).toMatch(/totalGte\.value = t\.relation === 'gte';/);
  });

  it('模板测试：模板命中 totalHits 传入 QRT（st-meta 与工具行同源同口径）', () => {
    expect(tplSrc).toMatch(/<QueryResultTable[^>]*:total="totalHits" :total-gte="totalGte"/);
    expect(tplSrc).toMatch(/const totalHits = ref\(0\);/);
  });

  it('SqlConsole 反向锁：SQL 行集不传 total（无服务端总数，传了即假分母）', () => {
    expect(sqlSrc).not.toMatch(/:total=/);
  });
});
