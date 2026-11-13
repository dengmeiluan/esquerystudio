/**
 * 二百七十八批：IndexHub 双表 totalGte 归一——同 RT 组件的「命中数为下界」+ 标注
 * 此前只在 DslQueryView 有，IndexHub docs/query 表缺失（同宿主形态差收敛）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

describe('IndexHub totalGte 归一（278 批）', () => {
  it('totalOf 共用件导入+双表归一+模板传递', () => {
    expect(ih).toMatch(/import \{ totalOf \} from '\.\.\/utils\/format';/);
    expect(ih).toMatch(/totalGte: r\.totalGte \?\? totalOf\(r\.hits as any\)\.gte/);
    expect(ih).toMatch(/const docsTotalGte = ref\(false\)/);
    expect(ih).toMatch(/:total-gte="docsTotalGte"/);
    expect(ih).toMatch(/:total-gte="qryResp\.totalGte"/);
  });
});
