/**
 * 三百七十六批：六查询通道计数口径守卫——用户曾实报两工作台计数不一致
 * （1/1777388 vs 1/500，2.8.18 修复 301 批 track_total_hits 语义统一）。
 * 本 spec 把复验结论钉死，任何通道漂移即红：
 *  - DSL 双宿主（IndexHub docs/qry + DslQuery）：RT total/totalGte 传入 + 计数条「+（命中数为下界）」；
 *  - Lucene/PIT/模板测试：QRT total/totalGte 传入（368 批）；
 *  - 沙盒：结果头 ≥ 前缀展示；
 *  - SqlConsole/SqlBridge：SQL 行集无服务端总数，禁传 total（假分母）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const rt = readFileSync(join(SRC, 'components/ResultTable.vue'), 'utf-8');
const idxHub = readFileSync(join(SRC, 'views/IndexHubView.vue'), 'utf-8');
const dsl = readFileSync(join(SRC, 'views/DslQueryView.vue'), 'utf-8');
const lucene = readFileSync(join(SRC, 'views/LuceneQueryView.vue'), 'utf-8');
const pit = readFileSync(join(SRC, 'views/PitScrollView.vue'), 'utf-8');
const tpl = readFileSync(join(SRC, 'views/SearchTemplatesView.vue'), 'utf-8');
const sandbox = readFileSync(join(SRC, 'views/SearchSandboxView.vue'), 'utf-8');
const sql = readFileSync(join(SRC, 'views/SqlConsoleView.vue'), 'utf-8');

describe('六通道计数口径守卫（376 批）', () => {
  it('RT 计数条：+ 下界标注与「命中数为下界」文案在场', () => {
    expect(rt).toMatch(/totalGte\?: boolean;/);
    expect(rt).toContain('（命中数为下界）');
    expect(rt).toMatch(/\{\{ hits\.length \}\}\/\{\{ fmtNum\(total\) \}\}<template v-if="totalGte">\+<\/template>/);
  });

  it('DSL 通道：IndexHub 双表与 DslQuery 全部传 total+totalGte', () => {
    expect(idxHub).toMatch(/:total-gte="docsTotalGte"/);
    expect(idxHub).toMatch(/:total-gte="qryResp\.totalGte"/);
    expect(dsl).toMatch(/:total="resp\.total"/);
    expect(dsl).toMatch(/:total-gte="resp\.totalGte"/);
  });

  it('Lucene/PIT/模板测试：QRT 三宿主接线（368 批口径）', () => {
    expect(lucene).toMatch(/:hits="hits" :total="total" :total-gte="totalGte"/);
    expect(pit).toMatch(/:hits="preview" :total="total" :total-gte="totalGte"/);
    expect(tpl).toMatch(/:hits="hits as any" :total="totalHits" :total-gte="totalGte"/);
  });

  it('沙盒通道：结果头 ≥ 前缀（totalOf relation）', () => {
    /* MetaStrip 改用批同步更新：≥ 前缀从模板内插值收进 ssResultMeta items（TookBadge 统一件），
       契约不变——沙盒结果头必须保留 gte 估计口径的 ≥ 前缀，仅看守形态同步更新 */
    expect(sandbox).toMatch(/totalGte\.value \? '≥ ' : ''/);
    expect(sandbox).toMatch(/const totalGte = computed\(\(\) => totalOf\(response\.value\?\.hits\)\.gte\);/);
  });

  it('SQL 通道反向锁：行集无总数不传 total（372 批口径延续）', () => {
    expect(sql).not.toMatch(/:total=/);
  });
});
